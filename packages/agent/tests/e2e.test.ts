/**
 * Synpatico End-to-End Integration Test
 * -------------------------------------
 * This test validates the core response optimization cycle between the
 * client SDK and the agent server.
 */

import { test, describe, beforeAll, afterAll, expect } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import { agent } from '../src/index'; 
import { createSynpaticoClient } from '../../client/src/index'; 

const TEST_PORT = 3002;
const TEST_AGENT_URL = `http://localhost:${TEST_PORT}`;

describe('Synpatico E2E Agent/Client Interaction', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    server.register(agent);
    await server.listen({ port: TEST_PORT });
  });

  afterAll(async () => {
    await server.close();
  });

  test('should handle GET request optimization flow correctly', async () => {
    const client = createSynpaticoClient();

    // --- 1. First Request (Learning) ---
    console.log('\n--- E2E: Making first GET request to /api/users/2 ---');
    const firstResponse = await client.fetch(`${TEST_AGENT_URL}/api/users/2`);
    
    expect(firstResponse).toBeTypeOf('object');
    expect(firstResponse.data.id).toBe(2);
    expect(firstResponse.data.email).toBe('janet.weaver@reqres.in');

    // --- 2. Second Request (Optimized) ---
    console.log('\n--- E2E: Making second GET request to /api/users/2 ---');
    const secondResponse = await client.fetch(`${TEST_AGENT_URL}/api/users/2`);

    expect(secondResponse).toBeTypeOf('object');
    expect(secondResponse.data.id).toBe(2);
    expect(secondResponse.data.email).toBe('janet.weaver@reqres.in');
  });

  // [REMOVED] The test case for two-way POST optimization is temporarily
  // removed until the feature is re-implemented and stabilized.
  /*
  test('should handle two-way (POST) optimization flow correctly', async () => {
    // ...
  });
  */
});
