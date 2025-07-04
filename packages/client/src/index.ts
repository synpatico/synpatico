/**
 * Synpatico Client SDK (Corrected & Simplified)
 * ---------------------------------------------
 * This version implements the robust architecture based on your feedback:
 * - It focuses only on GET request optimization for the MVP.
 * - It correctly handles the Response body stream to avoid errors.
 * - It always returns a `Response` object to maintain compatibility.
 * - It includes a complete, cooperative patch for XMLHttpRequest.
 */

import { createStructureDefinition, encode, decode, type ClientRegistry, type StructurePacket, type StructureDefinition } from '@synpatico/core';

// Augment the XMLHttpRequest interface to store our custom state.
declare global {
  interface XMLHttpRequest {
    _synpaticoUrl?: string;
    _synpaticoMethod?: string;
  }
}

export interface SynpaticoClientOptions {
  isTargetUrl?: (url: string) => boolean;
}

export interface SynpaticoClient {
  fetch: (url: string | URL, options?: RequestInit) => Promise<Response>;
  patchGlobal: () => void;
  clearCache: () => void;
}

/**
 * Factory function to create a new Synpatico client instance.
 */
export function createSynpaticoClient(options: SynpaticoClientOptions = {}): SynpaticoClient {
  
  const { isTargetUrl } = options;
  const registry: ClientRegistry = {
    structures: new Map<string, StructureDefinition>(),
    patterns: new Map(),
    requestToStructureId: new Map<string, string>(),
  };
  const knownSynpaticoOrigins = new Set<string>();
  let isPatched = false;

  const originalFetch = typeof window !== 'undefined' ? window.fetch : fetch;
  const originalXhrOpen = typeof XMLHttpRequest !== 'undefined' ? XMLHttpRequest.prototype.open : undefined;
  const originalXhrSend = typeof XMLHttpRequest !== 'undefined' ? XMLHttpRequest.prototype.send : undefined;

  /**
   * The main fetch wrapper function. This now always returns a `Response` object.
   */
  async function synpaticoFetch(url: string | URL, fetchOptions: RequestInit = {}): Promise<Response> {
    const urlString = url.toString();
    const origin = new URL(urlString).origin;

    if (isTargetUrl && !isTargetUrl(urlString)) {
      return originalFetch(url, fetchOptions);
    }
    
    const enhancedOptions = { ...fetchOptions };
    const headers = new Headers(enhancedOptions.headers);
    let wasOptimizedRequest = false;

    if (knownSynpaticoOrigins.has(origin)) {
      if (!fetchOptions.method || fetchOptions.method.toUpperCase() === 'GET') {
        const knownStructureId = registry.requestToStructureId.get(urlString);
        if (knownStructureId) {
          headers.set('X-Synpatico-Accept-ID', knownStructureId);
          wasOptimizedRequest = true;
        }
      }
    }
    
    enhancedOptions.headers = headers;

    const response = await originalFetch(urlString, enhancedOptions);

    // --- Response Handling ---

    // Handle a state conflict by retrying the request without optimization headers.
    if (response.status === 409 && wasOptimizedRequest) {
      console.warn('[Synpatico] State conflict (409). Retrying with standard JSON.');
      return originalFetch(url, fetchOptions);
    }
    
    // If the response is not from a Synpatico agent, pass it through untouched.
    if (!response.headers.has('X-Synpatico-Agent')) {
        return response;
    }
    
    // At this point, we know it's a Synpatico agent. We cache the origin.
    knownSynpaticoOrigins.add(origin);

    // Handle an optimized packet from the server.
    if (response.headers.get('content-type')?.includes('application/synpatico-packet+json')) {
      const packet = await response.json() as StructurePacket;
      const structureDef = registry.structures.get(packet.structureId);
      if (!structureDef) {
        throw new Error(`[Synpatico] Received packet for unknown structure: ${packet.structureId}.`);
      }
      const decodedData = decode(packet, structureDef);
      // Construct a new Response object with the decoded data.
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Content-Type', 'application/json');
      return new Response(JSON.stringify(decodedData), {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }
    
    // This is a standard JSON response from a Synpatico-enabled agent (learning step).
    const responseClone = response.clone();
    try {
      const data = await responseClone.json();
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const structureDef = createStructureDefinition(data);
        registry.structures.set(structureDef.id, structureDef);
        registry.requestToStructureId.set(urlString, structureDef.id);
        console.log(`[Synpatico] Learned and cached new structure: ${structureDef.id}`);
      }
    } catch(e) { /* Not a JSON response, do nothing. */ }
    
    // Return the original, untouched response object so the application
    // code can call .json() on it as expected.
    return response;
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
        const origin = url ? new URL(url).origin : '';

        if (url && (!isTargetUrl || isTargetUrl(url))) {
          if (knownSynpaticoOrigins.has(origin)) {
            const knownStructureId = registry.requestToStructureId.get(url);
            if (knownStructureId) {
              self.setRequestHeader('X-Synpatico-Accept-ID', knownStructureId);
            }
          }
          
          const loadListener = function() {
            self.removeEventListener('load', loadListener);
            
            if (self.getResponseHeader('X-Synpatico-Agent')) {
              knownSynpaticoOrigins.add(origin);
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
            }
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
      knownSynpaticoOrigins.clear();
      console.log('[Synpatico] Cache cleared.');
    },
  };
}
