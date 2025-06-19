import { bench, describe, beforeEach } from "vitest"
import { generateStructureId, resetState } from "../src/index"

// Test data with different object types and complexities
const testObjects = {
	small: { name: "John", age: 30 },
	medium: {
		name: "John",
		age: 30,
		address: {
			street: "123 Main St",
			city: "Anytown",
			zip: "12345"
		},
		hobbies: ["reading", "coding"]
	},
	large: {
		users: Array.from({ length: 100 }, (_, i) => ({
			id: i,
			name: `User ${i}`,
			email: `user${i}@example.com`,
			profile: {
				age: 20 + (i % 50),
				preferences: {
					theme: i % 2 === 0 ? "dark" : "light",
					notifications: i % 3 === 0
				}
			}
		}))
	},
	nested: {
		level1: {
			level2: {
				level3: {
					level4: {
						level5: {
							data: "deep nesting"
						}
					}
				}
			}
		}
	},
	array: Array.from({ length: 1000 }, (_, i) => i),
	mixed: {
		string: "hello",
		number: 42,
		boolean: true,
		null: null,
		undefined: undefined,
		array: [1, 2, 3],
		object: { nested: true }
	}
}

describe("JSON.stringify vs generateStructureId", () => {
	describe("Small Object", () => {
		beforeEach(() => {
			resetState()
		})

		bench("JSON.stringify", () => {
			JSON.stringify(testObjects.small)
		})

		bench("generateStructureId", () => {
			generateStructureId(testObjects.small)
		})
	})

	describe("Medium Object", () => {
		beforeEach(() => {
			resetState()
		})

		bench("JSON.stringify", () => {
			JSON.stringify(testObjects.medium)
		})

		bench("generateStructureId", () => {
			generateStructureId(testObjects.medium)
		})
	})

	describe("Large Object (100 users)", () => {
		beforeEach(() => {
			resetState()
		})

		bench("JSON.stringify", () => {
			JSON.stringify(testObjects.large)
		})

		bench("generateStructureId", () => {
			generateStructureId(testObjects.large)
		})
	})

	describe("Deeply Nested Object", () => {
		beforeEach(() => {
			resetState()
		})

		bench("JSON.stringify", () => {
			JSON.stringify(testObjects.nested)
		})

		bench("generateStructureId", () => {
			generateStructureId(testObjects.nested)
		})
	})

	describe("Large Array (1000 items)", () => {
		beforeEach(() => {
			resetState()
		})

		bench("JSON.stringify", () => {
			JSON.stringify(testObjects.array)
		})

		bench("generateStructureId", () => {
			generateStructureId(testObjects.array)
		})
	})

	describe("Mixed Types Object", () => {
		beforeEach(() => {
			resetState()
		})

		bench("JSON.stringify", () => {
			JSON.stringify(testObjects.mixed)
		})

		bench("generateStructureId", () => {
			generateStructureId(testObjects.mixed)
		})
	})
})