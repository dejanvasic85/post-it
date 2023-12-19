import { json, type RequestHandler } from '@sveltejs/kit';

import { taskEither as TE } from 'fp-ts';
import { pipe } from 'fp-ts/lib/function';

import { mapToApiError } from '$lib/server/mapApi';
import { getNoteById, updateNote, deleteNote } from '$lib/server/db/notesDb';
import { getUser } from '$lib/server/db/userDb';
import { isNoteOwner } from '$lib/server/services/userService';
import { parseRequest } from '$lib/server/parseRequest';
import { NotePatchInputSchema } from '$lib/types';

export const GET: RequestHandler = ({ locals, params }) => {
	return pipe(
		TE.Do,
		TE.bind('user', () => getUser({ id: locals.user.id! })),
		TE.bind('note', () => getNoteById({ id: params.id! })),
		TE.flatMap(({ user, note }) => isNoteOwner({ user, note })),
		TE.mapLeft(mapToApiError),
		TE.match(
			(err) => json({ message: err.message }, { status: err.status }),
			(note) => json(note)
		)
	)();
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	return pipe(
		TE.Do,
		TE.bind('noteInput', () =>
			parseRequest(request, NotePatchInputSchema, 'Unable to parse NotePatchInputSchema')
		),
		TE.bind('note', () => getNoteById({ id: params.id! })),
		TE.bind('user', () => getUser({ id: locals.user.id! })),
		TE.flatMap((params) => isNoteOwner(params)),
		TE.flatMap(({ noteInput, note }) => updateNote({ ...note, ...noteInput })),
		TE.mapLeft(mapToApiError),
		TE.match(
			(err) => json({ message: err.message }, { status: err.status }),
			(note) => json(note)
		)
	)();
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	return pipe(
		TE.Do,
		TE.bind('note', () => getNoteById({ id: params.id! })),
		TE.bind('user', () => getUser({ id: locals.user.id! })),
		TE.flatMap((params) => isNoteOwner(params)),
		TE.flatMap(({ note }) => deleteNote({ id: note.id! })),
		TE.mapLeft(mapToApiError),
		TE.match(
			(err) => json({ message: err.message }, { status: err.status }),
			() => new Response(null, { status: 204 })
		)
	)();
};
