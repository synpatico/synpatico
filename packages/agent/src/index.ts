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
    // PART 1: Handle Incoming OPTIMIZED REQUESTS (POST/PUT)
    if (request.headers['content-type'] === 'application/synpatico-packet+json') {
      fastify.log.info(`Received an optimized request packet for path: ${request.url}`);
      const packet = request.body as StructurePacket;
      const structureDef = serverStructureCache.get(packet.structureId);

      if (!structureDef) {
        fastify.log.error(`State Conflict: Received optimized request for unknown structure ID: ${packet.structureId}`);
        reply.code(409).send({ error: 'State Conflict' });
        return reply;
      }

      request.body = decode(packet, structureDef);
      request.headers['content-type'] = 'application/json';
      return; 
    }

    // PART 2: Handle Outgoing OPTIMIZED RESPONSES (GET)
    // [MODIFIED] Using the new, branded header name.
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
            const optimizedPacket = encode(freshData, { knownStructureId: acceptedStructureId });
            reply
              .code(200)
              .header('Content-Type', 'application/synpatico-packet+json')
              // [MODIFIED] Using the new, branded header name in the response.
              .header('X-Synpatico-ID', acceptedStructureId)
              .send(optimizedPacket);
            return reply;
        } else {
            reply.send(freshData);
            return reply;
        }
      } catch (error) {
        fastify.log.error(error, `Failed to process optimized request for structure ID: ${acceptedStructureId}`);
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
        if (key.toLowerCase() !== 'host' && request.headers[key]) {
          forwardedHeaders.set(key, request.headers[key] as string);
        }
      }
      forwardedHeaders.set('x-api-key', UPSTREAM_API_KEY);

      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: forwardedHeaders,
        body: (request.method !== 'GET' && request.method !== 'HEAD') ? (request.body as BodyInit) : undefined,
      });

      const responseBodyText = await upstreamResponse.text();
      
      // Learning Step
      try {
        if (upstreamResponse.headers.get('content-type')?.includes('application/json')) {
            const jsonData = JSON.parse(responseBodyText);
            if (typeof jsonData === 'object' && jsonData !== null && !Array.isArray(jsonData)) {
              const structureDef = createStructureDefinition(jsonData);
              // Log the generated ID so you can use it in the next request.
              fastify.log.info(`Learned and cached new structure [${structureDef.id}] for path: ${request.url}`);
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
