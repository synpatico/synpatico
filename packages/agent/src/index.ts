/**
 * Synpatico Agent (for Bun) - Manual Proxy Implementation
 * -------------------------------------------------------
 * This version replaces `@fastify/http-proxy` with a manual reverse proxy
 * using a catch-all route and `fetch` to improve stability and control.
 */

import Fastify, { 
  type FastifyInstance, 
  type FastifyPluginAsync, 
  type FastifyRequest, 
  type FastifyReply 
} from 'fastify';
import fp from 'fastify-plugin';
import { createStructureDefinition, encode, decode, type StructureDefinition, type StructurePacket } from '@synpatico/core';

// --- Configuration ---
const AGENT_PORT = 3000;
const UPSTREAM_API_URL = 'https://reqres.in';
const UPSTREAM_API_KEY = 'reqres-free-v1';

/**
 * This is the core logic of your application, wrapped as a Fastify plugin.
 */
const agentPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const serverStructureCache = new Map<string, StructureDefinition>();

  // This hook runs for every request. It handles the "optimized path".
  fastify.addHook('onRequest', async (request, reply) => {
    // PART 2: Handle Outgoing OPTIMIZED RESPONSES (GET)
    const acceptedStructureId = request.headers['x-synpatico-accept-id'] as string | undefined;

    if (acceptedStructureId && serverStructureCache.has(acceptedStructureId)) {
      fastify.log.info(`Cache HIT for structure ID: ${acceptedStructureId}`);
      try {
        const upstreamUrl = `${UPSTREAM_API_URL}${request.url}`;
        const upstreamResponse = await fetch(upstreamUrl, {
          headers: { 'x-api-key': UPSTREAM_API_KEY }
        });

        if (!upstreamResponse.ok) {
          reply.code(upstreamResponse.status).send(await upstreamResponse.text());
          return reply;
        }

        const freshData = await upstreamResponse.json();
        if (typeof freshData === 'object' && freshData !== null && !Array.isArray(freshData)) {
          // Get the cached structure definition to validate against
          const cachedStructureDef = serverStructureCache.get(acceptedStructureId);
          
          // Verify the fresh data matches the expected structure
          const freshStructureDef = createStructureDefinition(freshData);
          
          if (cachedStructureDef && freshStructureDef.id === acceptedStructureId) {
            // Structure matches, safe to optimize
            const optimizedPacket = encode(freshData, { knownStructureId: acceptedStructureId });
            reply
              .code(200)
              .header('Content-Type', 'application/synpatico-packet+json')
              .header('X-Synpatico-ID', acceptedStructureId)
              .send(optimizedPacket);
            return reply;
          } else {
            // Structure mismatch, fall back to normal JSON
            fastify.log.warn(`Structure mismatch for ID: ${acceptedStructureId}. Expected: ${acceptedStructureId}, Got: ${freshStructureDef.id}. Falling back to JSON.`);
            reply.send(freshData);
            return reply;
          }
        } else {
          reply.send(freshData);
          return reply;
        }
      } catch (error) {
        fastify.log.error(error, `Failed to process optimized request for structure ID: ${acceptedStructureId}`);
        // Fall back to normal processing instead of throwing
        // Let the request continue to the catch-all handler
      }
    } else if (acceptedStructureId) {
      fastify.log.warn(`Cache MISS for structure ID: ${acceptedStructureId}. Passing through.`);
    }
  });

  // This catch-all route handles all other requests (the "pass-through" path).
  fastify.all('/*', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const upstreamUrl = `${UPSTREAM_API_URL}${request.url}`;
      fastify.log.info(`Proxying standard request to: ${upstreamUrl}`);
      
      const forwardedHeaders = new Headers();
      for (const key in request.headers) {
        if (!['host', 'content-length'].includes(key.toLowerCase()) && request.headers[key]) {
          forwardedHeaders.set(key, request.headers[key] as string);
        }
      }
      forwardedHeaders.set('x-api-key', UPSTREAM_API_KEY);

      const body = (request.method !== 'GET' && request.method !== 'HEAD' && request.body)
        ? JSON.stringify(request.body)
        : undefined;

      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: forwardedHeaders,
        body: body,
      });

      // --- Learning Step ---
      const responseBodyText = await upstreamResponse.text();
      
      try {
        if (upstreamResponse.headers.get('content-type')?.includes('application/json')) {
            const jsonData = JSON.parse(responseBodyText);
            if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
              const structureDef = createStructureDefinition(jsonData);
              fastify.log.info(`Learned and cached new structure: ${structureDef.id}`);
              serverStructureCache.set(structureDef.id, structureDef);
            }
        }
      } catch (error) {
          fastify.log.warn('Could not parse JSON from upstream response for learning.');
      }
      
      const replyHeaders: Record<string, string> = {};
      for (const [key, value] of upstreamResponse.headers.entries()) {
        if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) {
          replyHeaders[key] = value;
        }
      }

      reply
        .code(upstreamResponse.status)
        .headers(replyHeaders)
        .send(responseBodyText);

    } catch (error) {
      fastify.log.error(error, 'Error in manual proxy handler');
      reply.code(500).send({ error: 'Internal Proxy Error' });
    }
  });
};

export const agent = fp(agentPlugin);

if (import.meta.main) {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
      },
    },
  });
  app.register(agent);
  app.listen({ port: AGENT_PORT }, (err) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
  });
}