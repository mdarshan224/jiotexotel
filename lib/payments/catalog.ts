import {db} from '@/lib/db';
import {fromPaise,toPaise} from '@/lib/wallet';
import {calculateSubscriptionExpiry} from '@/lib/subscriptions';
import {dispatchCustomerWalletNotification,dispatchSubscriptionNotification} from '@/lib/services/walletNotification';
export function assertCapturedPayment(payment:any,record:any){
 const expected=record.amountPaise||toPaise(record.amount);
 if(!payment?.id||payment.order_id!==record.gatewayOrderId||payment.currency!=='INR'||payment.amount!==expected||payment.status!=='captured')throw new Error('Captured payment does not match the expected order, amount and currency.');
}
export async function fulfillWalletTopup(transactionId:string,payment:any){
 const transaction=await db.walletTransaction.findUnique({where:{id:transactionId}});
 if(!transaction||transaction.type!=='TOPUP')throw new Error('Wallet recharge was not found.');
 assertCapturedPayment(payment,transaction);
 const razorpayPaymentId=payment.id;
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "WalletTransaction" WHERE "id" = ${transaction.id}`;
      const currentTransaction = await tx.walletTransaction.findUnique({ where: { id: transaction.id } });
      if (!currentTransaction || currentTransaction.customerId !== transaction.customerId) {
        throw new Error('Wallet top-up transaction was not found.');
      }
      if (currentTransaction.status === 'SUCCESS') {
        return { transaction: currentTransaction, alreadyProcessed: true };
      }
      const existingPayment = await tx.walletTransaction.findUnique({ where: { gatewayPaymentId: razorpayPaymentId } });
      if (existingPayment && existingPayment.id !== transaction.id) {
        throw new Error('This payment has already been processed.');
      }
      await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${currentTransaction.walletId}`;
      const wallet = await tx.customerWallet.findUnique({ where: { id: currentTransaction.walletId } });
      if (!wallet) throw new Error('Customer wallet was not found.');
      const currentBalancePaise = typeof wallet.balancePaise === 'number' ? wallet.balancePaise : toPaise(wallet.balance);
      const currentPaidBalancePaise = typeof wallet.paidBalancePaise === 'number' ? wallet.paidBalancePaise : currentBalancePaise;
      const rechargePaise = currentTransaction.amountPaise || toPaise(currentTransaction.amount);
      const bonusPaise = currentTransaction.bonusAmount ? toPaise(currentTransaction.bonusAmount) : 0;
      const nextBalancePaise = currentBalancePaise + rechargePaise + bonusPaise;
      const updatedWallet = await tx.customerWallet.update({
        where: { id: wallet.id },
        data: { balance: fromPaise(nextBalancePaise), balancePaise: nextBalancePaise, paidBalancePaise: currentPaidBalancePaise + rechargePaise },
      });
      const updatedTransaction = await tx.walletTransaction.update({
        where: { id: currentTransaction.id },
        data: {
          status: 'SUCCESS',
          gatewayPaymentId: razorpayPaymentId,
          amountPaise: rechargePaise,
          balanceAfter: updatedWallet.balance,
          balanceAfterPaise: nextBalancePaise,
          failureReason: null,
        },
      });
      let bonusTransaction = null;
      if ((currentTransaction.bonusAmount || 0) > 0) {
        bonusTransaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            customerId: currentTransaction.customerId,
            type: 'BONUS',
            amount: currentTransaction.bonusAmount || 0,
            amountPaise: bonusPaise,
            originalRechargeAmount: currentTransaction.amount,
            bonusAmount: currentTransaction.bonusAmount,
            bonusExpiryDate: currentTransaction.bonusExpiryDate,
            campaignId: currentTransaction.campaignId,
            status: 'SUCCESS',
            referenceId: `wallet-bonus-${currentTransaction.id}`,
            balanceAfter: updatedWallet.balance,
            balanceAfterPaise: nextBalancePaise,
          },
        });
        await tx.walletBonusGrant.create({
          data: {
            walletId: wallet.id,
            customerId: currentTransaction.customerId,
            sourceTransactionId: bonusTransaction.id,
            rechargeTransactionId: currentTransaction.id,
            campaignId: currentTransaction.campaignId,
            grantedPaise: bonusPaise,
            remainingPaise: bonusPaise,
            status: 'ACTIVE',
            expiresAt: currentTransaction.bonusExpiryDate,
          },
        });
      }

      await dispatchCustomerWalletNotification(tx, {
        customerId: currentTransaction.customerId,
        type: 'TOPUP',
        amount: currentTransaction.amount,
        balanceAfter: updatedWallet.balance,
        referenceId: updatedTransaction.referenceId,
      });

      return { wallet: updatedWallet, transaction: updatedTransaction, bonusTransaction, alreadyProcessed: false };
    });
}
export async function fulfillSubscriptionPurchase(paymentId:string,payment:any,razorpaySignature?:string){
 const paymentRecord=await db.subscriptionPayment.findUnique({where:{id:paymentId},include:{offer:true}});
 if(!paymentRecord)throw new Error('Subscription purchase was not found.');
 assertCapturedPayment(payment,paymentRecord);
 const razorpayPaymentId=payment.id;
    return await db.$transaction(async (tx) => {
      const duplicate = await tx.subscriptionPayment.findUnique({ where: { gatewayPaymentId: razorpayPaymentId } });
      if (duplicate && duplicate.id !== paymentRecord.id) throw new Error('This payment has already been processed.');
      await tx.$queryRaw`SELECT "id" FROM "SubscriptionPayment" WHERE "id" = ${paymentRecord.id}`;
      const current = await tx.subscriptionPayment.findUnique({ where: { id: paymentRecord.id }, include: { offer: true } });
      if (!current) throw new Error('Subscription payment was not found.');
      if (current.status === 'SUCCESS') return tx.customerSubscription.findUnique({ where: { paymentId: current.id } });
      const latest = await tx.customerSubscription.findFirst({
        where: { customerId: paymentRecord.customerId, status: 'ACTIVE', expiryDate: { gt: new Date() } },
        orderBy: { expiryDate: 'desc' },
      });
      const startDate = latest ? latest.expiryDate : new Date();
      let offer=current.offer;try{const snapshot=JSON.parse(current.offerSnapshotJson||'{}');if(snapshot.id===current.offerId&&Number.isInteger(snapshot.pickupLimit)&&snapshot.pickupLimit>0)offer=snapshot;}catch{}
      const expiryDate = calculateSubscriptionExpiry(startDate, offer);
      await tx.subscriptionPayment.update({
        where: { id: current.id },
        data: {
          status: 'SUCCESS',
          paymentMethod: 'RAZORPAY',
          gatewayPaymentId: razorpayPaymentId,
          signature: razorpaySignature,
          failureReason: null,
        },
      });
      const createdSub = await tx.customerSubscription.create({
        data: {
          customerId: paymentRecord.customerId,
          offerId: current.offerId,
          paymentId: current.id,
          startDate,
          expiryDate,
          status: 'ACTIVE',
          pickupsAllowed: offer.pickupLimit ?? 4,
          pickupsUsed: 0,
          autoRenew: false,
        },
        include: { offer: true },
      });

      await dispatchSubscriptionNotification(tx, {
        customerId: paymentRecord.customerId,
        type: 'SUBSCRIPTION_PURCHASE',
        planName: offer.name,
        price: current.amount,
        expiryDate,
        pickupsAllowed: offer.pickupLimit ?? 4,
      });

      return createdSub;
    });
}
