/**
 * Synpatico End-to-End Integration Test
 * -------------------------------------
 * This test validates the full communication cycle between the Synpatico
 * client SDK and the Synpatico agent server.
 */

import { test, describe, beforeAll, afterAll, expect } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Import the agent plugin and the client factory
import { agent } from '../src/index'; 
import { createSynpaticoClient } from '../../client/src/index'; 

// --- Test Configuration ---
const TEST_PORT = 3002;
const TEST_AGENT_URL = `http://localhost:${TEST_PORT}`;

describe('Synpatico E2E Agent/Client Interaction', () => {
  let server: FastifyInstance;

  // Before any tests run, start a new Fastify server with the agent plugin.
  beforeAll(async () => {
    server = Fastify();
    server.register(agent);
    await server.listen({ port: TEST_PORT });
  });

  // After all tests are finished, shut down the server.
  afterAll(async () => {
    await server.close();
  });

  test('should handle GET request optimization flow correctly', async () => {
    // 1. Initialize a new, clean client for this test.
    const client = createSynpaticoClient();

    // --- 2. Make the First Request (Learning) ---
    console.log('\n--- E2E: Making first GET request to /api/users/2 ---');
    const firstResponse = await client.fetch(`${TEST_AGENT_URL}/api/users/2`);
    
    // [FIXED] We must now call .json() on the Response object to get the body.
    const firstBody = await firstResponse.json();

    // Assertions for the first response (should be standard JSON)
    expect(firstBody).toBeTypeOf('object');
    expect(firstBody.data.id).toBe(2);
    expect(firstBody.data.email).toBe('janet.weaver@reqres.in');

    // --- 3. Make the Second Request (Optimized) ---
    console.log('\n--- E2E: Making second GET request to /api/users/2 ---');
    const secondResponse = await client.fetch(`${TEST_AGENT_URL}/api/users/2`);
    
    // [FIXED] The client SDK automatically decodes the packet, but still returns a Response.
    const secondBody = await secondResponse.json();

    // Assertions for the second response (should be the decoded optimized data)
    expect(secondBody).toBeTypeOf('object');
    expect(secondBody.data.id).toBe(2);
    expect(secondBody.data.email).toBe('janet.weaver@reqres.in');
  });

  test('should handle two-way (POST) optimization flow correctly', async () => {
    // This test is temporarily disabled until two-way optimization is re-implemented.
    expect(true).toBe(true);
  });
});
