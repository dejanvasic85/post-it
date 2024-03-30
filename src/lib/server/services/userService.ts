import { taskEither as TE } from 'fp-ts';
import { pipe } from 'fp-ts/lib/function';

import { fetchAuthUser } from '$lib/auth/fetchUser';
import {
	createConnection,
	createUser,
	createInvite,
	getConnections,
	getUserByAuthId,
	getInvite,
	updateInvite
} from '$lib/server/db/userDb';
import { createError, withError } from '$lib/server/createError';
import type { AuthUserProfile, Board, Note, ServerError, User, UserConnection } from '$lib/types';
import { generateId } from '$lib/identityGenerator';
import { sendEmail } from '$lib/server/services/emailService';

interface IsBoardOwnerParams {
	user: User;
	board: Board;
}

export const isBoardOwner = <T extends IsBoardOwnerParams>({
	user,
	board,
	...rest
}: T): TE.TaskEither<ServerError, T> =>
	user.boards.some((b) => b.id === board.id)
		? TE.right({ user, board, ...rest } as T)
		: TE.left(
				createError('AuthorizationError', `User ${user.id} is not the owner of board ${board.id}`)
			);

interface IsNoteOwnerParams {
	note: Note;
	user: User;
}

export const isNoteOwner = <T extends IsNoteOwnerParams>({
	note,
	user,
	...rest
}: T): TE.TaskEither<ServerError, T> =>
	user.boards.some((board) => board.id === note.boardId)
		? TE.right({ note, user, ...rest } as T)
		: TE.left(
				createError('AuthorizationError', `User ${user.id} is not the owner of note ${note.id}`)
			);

const tryFetchAuthUser = ({
	accessToken
}: {
	accessToken: string;
}): TE.TaskEither<ServerError, AuthUserProfile> =>
	TE.tryCatch(
		() => fetchAuthUser({ accessToken }),
		withError('FetchError', 'Failed to fetch user with access token')
	);

interface GetOrCreateUserParams {
	authId: string;
	authUserProfile: AuthUserProfile;
}

export const getOrCreateUser = ({
	authId,
	authUserProfile
}: GetOrCreateUserParams): TE.TaskEither<ServerError, User> =>
	pipe(
		getUserByAuthId(authId),
		TE.orElse((err) => {
			if (err._tag === 'RecordNotFound') {
				return createUser({ authUserProfile });
			}
			return TE.left(err);
		})
	);

interface GetOrCreateParams {
	accessToken: string;
	authId: string;
}

export const getOrCreateUserByAuth = ({
	accessToken,
	authId
}: GetOrCreateParams): TE.TaskEither<ServerError, User> =>
	pipe(
		getUserByAuthId(authId),
		TE.orElse((err) => {
			if (err._tag === 'RecordNotFound') {
				return pipe(
					tryFetchAuthUser({ accessToken }),
					TE.flatMap((u) => createUser({ authUserProfile: u }))
				);
			}
			return TE.left(err);
		})
	);

export const getCurrentBoardForUserNote = ({
	note,
	user
}: {
	note: Note;
	user: User;
}): TE.TaskEither<ServerError, { note: Note; user: User; board: Board }> => {
	const boardId = note.boardId;
	const board = user.boards.find((b) => b.id === boardId);
	if (!board) {
		return TE.left(createError('RecordNotFound', `Board ${boardId} not found`));
	}
	return TE.right({ note, user, board });
};

interface SendInviteParams {
	name: string;
	userId: string;
	friendEmail: string;
	baseUrl: string;
}

// todo: unit test
export const sendInvite = ({
	baseUrl,
	name,
	userId,
	friendEmail
}: SendInviteParams): TE.TaskEither<ServerError, void> => {
	return pipe(
		createInvite({ id: generateId('inv'), userId, friendEmail, acceptedAt: null }),
		TE.flatMap(({ id }) => {
			const inviteLink = `${baseUrl}/invite/${id}`;
			const html = `Hello ${friendEmail}. 
			<p>You have been invited by ${name} to join them in collaborating on Notes.</p> 
			<p>Accept <a href="${inviteLink}">invite</a> to get started now.</p>`;
			return sendEmail({
				to: friendEmail,
				subject: 'You have been invited to share notes',
				html
			});
		})
	);
};

// todo: unit test
export const acceptInvite = (
	inviteId: string,
	acceptedBy: Pick<User, 'id' | 'email'>
): TE.TaskEither<ServerError, UserConnection> => {
	return pipe(
		getInvite(inviteId, { friendEmail: acceptedBy.email }),
		TE.flatMap((invite) => updateInvite({ ...invite, acceptedAt: new Date() })),
		TE.flatMap((invite) =>
			createConnection({
				userFirstId: invite.userId,
				userSecondId: acceptedBy.id,
				type: 'connected'
			})
		)
	);
};

// get user friends
export const getFriends = (userId: string) => {
	return pipe(getConnections(userId));
};
