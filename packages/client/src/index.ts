/**
 * Synpatico Client SDK
 * --------------------
 * This file provides a 'smart' client that understands the Synpatico protocol.
 */

import { createStructureDefinition, encode, decode, type ClientRegistry, type StructurePacket, type StructureDefinition } from '@synpatico/core';

// Augment the XMLHttpRequest interface to store our custom state.
declare global {
  interface XMLHttpRequest {
    _synpaticoUrl?: string;
    _synpaticoMethod?: string;
  }
}

export interface SynpaticoClientOptions {}

export interface SynpaticoClient {
  fetch: (url: string | URL, options?: RequestInit) => Promise<any>;
  patchGlobal: () => void;
  clearCache: () => void;
}

/**
 * Factory function to create a new Synpatico client instance.
 * It encapsulates the protocol and cache logic in a closure.
 */
export function createSynpaticoClient(options: SynpaticoClientOptions = {}): SynpaticoClient {
  
  // --- State Initialization ---
  const registry: ClientRegistry = {
    structures: new Map<string, StructureDefinition>(),
    patterns: new Map(),
    requestToStructureId: new Map<string, string>(),
  };
  let isPatched = false;

  const originalFetch = typeof window !== 'undefined' ? window.fetch : fetch;
  const originalXhrOpen = typeof XMLHttpRequest !== 'undefined' ? XMLHttpRequest.prototype.open : undefined;
  const originalXhrSend = typeof XMLHttpRequest !== 'undefined' ? XMLHttpRequest.prototype.send : undefined;

  async function synpaticoFetch(url: string | URL, options: RequestInit = {}): Promise<any> {
    const urlString = url.toString();
    
    // --- 1. Prepare Request ---
    const enhancedOptions = { ...options };
    const headers = new Headers(enhancedOptions.headers);

    // [REMOVED] Two-way optimization for POST/PUT requests is temporarily disabled.
    /*
    if (['POST', 'PUT', 'PATCH'].includes(options.method?.toUpperCase() || '') && typeof options.body === 'string') {
      // ... logic for optimizing outgoing requests ...
    }
    */

    // Optimization for GET requests
    if (!options.method || options.method.toUpperCase() === 'GET') {
      const knownStructureId = registry.requestToStructureId.get(urlString);
      if (knownStructureId) {
        headers.set('X-Synpatico-Accept-ID', knownStructureId);
      }
    }
    
    enhancedOptions.headers = headers;

    // --- 2. Make the actual network call ---
    const response = await originalFetch(urlString, enhancedOptions);

    // --- 3. Handle the Response ---
    if (response.status === 409) {
      console.warn('[Synpatico] State conflict (409). Retrying with standard JSON.');
      const retryOptions = { ...options };
      const jsonResponse = await originalFetch(url, retryOptions);
      return jsonResponse.json();
    }
    
    if (response.headers.get('content-type')?.includes('application/synpatico-packet+json')) {
      const packet = await response.json() as StructurePacket;
      const structureDef = registry.structures.get(packet.structureId);
      if (!structureDef) {
        throw new Error(`[Synpatico] Received packet for unknown structure: ${packet.structureId}.`);
      }
      console.log(`[Synpatico] Decoding optimized response for structure: ${packet.structureId}`);
      return decode(packet, structureDef);
    }
    
    const responseClone = response.clone();
    try {
      const data = await responseClone.json();
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const structureDef = createStructureDefinition(data);
        registry.structures.set(structureDef.id, structureDef);
        registry.requestToStructureId.set(urlString, structureDef.id);
        console.log(`[Synpatico] Learned and cached new structure: ${structureDef.id}`);
      }
      return data;
    } catch(e) {
      return response;
    }
  }

  function patchGlobal(): void {
    if (isPatched || typeof window === 'undefined') return;
    
    isPatched = true;
    console.log('[Synpatico] Patching global fetch and XMLHttpRequest.');

    window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = (input instanceof Request) ? input.url : input.toString();
      const options = init || ((input instanceof Request) ? input : {});
      return synpaticoFetch(url, options);
    };

    if(originalXhrOpen && originalXhrSend) {
      XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
        this._synpaticoUrl = url.toString();
        this._synpaticoMethod = method;
        return originalXhrOpen.apply(this, [method, url, async, username, password]);
      };

      XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
        const self = this;
        const url = self._synpaticoUrl;
        if (url) {
          const knownStructureId = registry.requestToStructureId.get(url);
          if (knownStructureId) {
            self.setRequestHeader('X-Synpatico-Accept-ID', knownStructureId);
          }
          const loadListener = function() {
            self.removeEventListener('load', loadListener);
            try {
              if (self.getResponseHeader('content-type')?.includes('application/synpatico-packet+json')) {
                const packet = JSON.parse(self.responseText);
                const structureDef = registry.structures.get(packet.structureId);
                if (structureDef) {
                  const decodedData = decode(packet, structureDef);
                  Object.defineProperty(self, 'responseText', { value: JSON.stringify(decodedData), writable: true });
                  Object.defineProperty(self, 'response', { value: decodedData, writable: true });
                }
              } else if (self.getResponseHeader('content-type')?.includes('application/json')) {
                const data = JSON.parse(self.responseText);
                if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                  const structureDef = createStructureDefinition(data);
                  registry.structures.set(structureDef.id, structureDef);
                  registry.requestToStructureId.set(url, structureDef.id);
                }
              }
            } catch(e) { /* Ignore errors */ }
          };
          self.addEventListener('load', loadListener);
        }
        return originalXhrSend.apply(this, [body]);
      };
    }
  }

  return {
    fetch: synpaticoFetch,
    patchGlobal,
    clearCache: () => {
      registry.structures.clear();
      registry.requestToStructureId.clear();
      console.log('[Synpatico] Cache cleared.');
    },
  };
}
