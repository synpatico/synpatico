import { bench, describe, beforeEach } from "vitest";
import complexNestedObject from "./largeobj"

// Import the original, stateful functions from the old file
import { 
  generateStructureId as generateStructureId_original, 
  resetState as resetState_original 
} from "../src/index.stateful";

// Import the new, deterministic functions from the new file, aliasing them as requested
import { 
  generateStructureId as generateStructureId_stateless, 
  resetState as resetState_stateless 
} from "../src/index";

// Create test objects with circular references
const createCircularObjects = () => {
  // Simple circular reference
  const simpleCircular: Record<string, any> = {
    id: 1,
    name: "simple circular"
  }
  simpleCircular.self = simpleCircular

  // Nested circular reference
  const nestedCircular: Record<string, any> = {
    id: 2,
    name: "nested circular",
    level1: {
      level2: {
        level3: {}
      }
    }
  }
  nestedCircular.level1.level2.level3.back = nestedCircular

  // Multiple circular references
  const obj1: Record<string, any> = { id: 3, name: "obj1" }
  const obj2: Record<string, any> = { id: 4, name: "obj2" }
  const obj3: Record<string, any> = { id: 5, name: "obj3" }
  
  obj1.ref = obj2
  obj2.ref = obj3
  obj3.ref = obj1
  
  // Complex object with arrays and circular references
  const complexCircular: Record<string, any> = {
    id: 6,
    name: "complex circular",
    users: [
      { id: 1, name: "User 1" },
      { id: 2, name: "User 2" }
    ],
    metadata: {
      created: new Date().toISOString(),
      version: "1.0.0"
    }
  }
  complexCircular.users[0].parent = complexCircular
  complexCircular.self = complexCircular

  return {
    simpleCircular,
    nestedCircular,
    circularChain: obj1,
    complexCircular
  }
}
// --- Test Data ---
// A consistent, moderately complex object to use for both tests.
const testObject = {
  page: 1,
  total_pages: 10,
  data: Array.from({ length: 20 }, (_, i) => ({
    id: i,
    email: `user_account_${i}@example-domain.com`,
    first_name: `FirstName${i}`,
    last_name: `LastName${i}`,
    status: i % 3 === 0 ? 'inactive' : 'active',
  }))
};

// Test data with different object structures
const testObjects = {
	empty: {},
	a_empty: [],
	simple: { id: 1, name: "test" },
	nested: {
		id: 1,
		user: {
			name: "John",
			email: "john@example.com",
		},
		tags: ["important", "featured"],
	},
	large: Object.fromEntries(
		Array.from({ length: 50 }, (_, i) => [`key${i}`, `value${i}`]),
	),
	complex: {
		id: "xyz123",
		user: {
			id: 42,
			name: "Jane Doe",
			email: "jane@example.com",
			preferences: {
				theme: "dark",
				notifications: {
					email: true,
					push: false,
					sms: true,
				},
			},
		},
		items: Array.from({ length: 20 }, (_, i) => ({
			id: i,
			name: `Item ${i}`,
			price: Math.random() * 100,
			tags: ["tag1", "tag2", `custom${i}`],
		})),
		metadata: {
			created: new Date().toISOString(),
			lastModified: new Date().toISOString(),
			version: "1.0.0",
		},
    circular: createCircularObjects()
	},
	array: Array.from({ length: 100 }, (_, i) => ({
		id: i,
		value: `value${i}`,
	})),
	verylarge: complexNestedObject,
  circular: createCircularObjects()
}





describe("Performance: Stateful vs. Stateless (Deterministic) ID Generation", () => {
  
  // Before each benchmark run, reset the state of BOTH library versions
  // to ensure a fair comparison of their "first-run" performance.
  beforeEach(() => {
    resetState_original();
    resetState_stateless();
  });

  bench("Original Stateful (Incremental)", () => {
    generateStructureId_original(testObject);
  });

  bench("New Stateless (Deterministic Hashing)", () => {
    generateStructureId_stateless(testObject);
  });

  
	describe("Empty Object", () => {
		bench("generateStructureId with an Empty Object", () => {
			generateStructureId_original(testObjects.empty)
		})

		bench("stateless generateStructureId with an Empty Object", () => {
			generateStructureId_stateless(testObjects.empty)
		})
	})

	describe("Empty Array", () => {
		bench("generateStructureId with an Empty Array", () => {
			generateStructureId_original(testObjects.a_empty)
		})

		bench("stateless generateStructureId with an Empty Array", () => {
			generateStructureId_stateless(testObjects.a_empty)
		})
	})

	describe("Simple Object", () => {
		bench("generateStructureId with a Simple Object", () => {
			generateStructureId_original(testObjects.simple)
		})

		bench("stateless generateStructureId with a Simple Object", () => {
			generateStructureId_stateless(testObjects.simple)
		})
	})

	describe("Nested Object", () => {
		bench("generateStructureId with a Nested Object", () => {
			generateStructureId_original(testObjects.nested)
		})

		bench("stateless generateStructureId with a Nested Object", () => {
			generateStructureId_stateless(testObjects.nested)
		})
	})

	describe("Large Object (50 properties)", () => {
		bench("generateStructureId with a Large Object (50 properties)", () => {
			generateStructureId_original(testObjects.large)
		})

		bench("stateless generateStructureId with a Large Object (50 properties)", () => {
			generateStructureId_stateless(testObjects.large)
		})
	})

	describe("Complex Object (Deeply Nested)", () => {
		bench("generateStructureId with a Complex Object (Deeply Nested)", () => {
			generateStructureId_original(testObjects.complex)
		})

		bench("stateless generateStructureId with a Complex Object (Deeply Nested)", () => {
			generateStructureId_stateless(testObjects.complex)
		})
	})

	describe("Large Array of Objects", () => {
		bench("generateStructureId with a large array of objects", () => {
			generateStructureId_original(testObjects.array)
		})

		bench("stateless generateStructureId with a large array of objects", () => {
			generateStructureId_stateless(testObjects.array)
		})
	})

	describe("With Collision Detection", () => {
		bench("generateStructureId with collision detection", () => {
			generateStructureId_original(testObjects.complex, {
				newIdOnCollision: true,
			})
		})

		bench("stateless generateStructureId with collision detection", () => {
			generateStructureId_stateless(testObjects.complex, {
				newIdOnCollision: true,
			})
		})
	})

	describe("Very large object", () => {
		bench("generateStructureId with a very large object", () => {
			generateStructureId_original(testObjects.verylarge)
		})

		bench("stateless generateStructureId with a very large object", () => {
			generateStructureId_stateless(testObjects.verylarge)
		})
	})

  describe("Circular referenced object", () => {
		bench("generateStructureId with a circular referenced", () => {
			generateStructureId_original(testObjects.circular)
		})

		bench("stateless generateStructureId with a circular referenced object", () => {
			generateStructureId_stateless(testObjects.circular)
		})
	})
})
