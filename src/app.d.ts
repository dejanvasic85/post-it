// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { User } from '$lib/types';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: User;
			userData?: User;
		}
		// interface PageData {}
		// interface Platform {}
	}
}

export {};
