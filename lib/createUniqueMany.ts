// SQLite equivalent of PostgreSQL createMany({ skipDuplicates: true }).
// Call with the transaction's delegate so writes stay in the same atomic commit.
export async function createUniqueMany(model: any, input: { data: any[] }) {
  let count = 0;
  for (const data of input.data) {
    if (data.id && await model.findUnique({ where: { id: data.id }, select: { id: true } })) continue;
    try { await model.create({ data }); count++; }
    catch (error) { if ((error as any)?.code !== 'P2002') throw error; }
  }
  return { count };
}
