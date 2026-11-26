import {appDownloadRedirect} from '../lib/appDownloadRedirect';
import { runWithRequestScope } from '../lib/requestScope';
import { initializeSite } from '../lib/sitesBootstrap';
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    return runWithRequestScope(async () => {
    const download=appDownloadRedirect(request);
    if(download)return download;
    const url = new URL(request.url);
    if ((request.method === 'GET' || request.method === 'HEAD') &&
        ['testing.junkitout.in', 'www.junkitout.in'].includes(url.hostname) &&
        !url.pathname.startsWith('/api/')) {
      url.hostname = 'junkitout.in';
      url.protocol = 'https:';
      url.port = '';
      return Response.redirect(url.toString(), 308);
    }
    await initializeSite();
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
    });
  },
};

export default worker;
