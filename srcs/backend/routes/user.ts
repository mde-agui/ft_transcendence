//routes/user.ts
import { FastifyInstance } from 'fastify';
import { createUser, getAllUsers, deleteUser } from '../services/services.js';

export async function userRoutes(fastify: FastifyInstance) {
	fastify.post('/users', async (request, reply) => {
		const { name, username, team, password } = request.body as {
			name: string;
			username: string;
			team: string;
			password: string;
		};

		if (!name || !username || !team || !password)
			return reply.status(400).send({ error: 'Missing fields' });

		try {
			await createUser(name, username, team, password);
			return reply.status(201).send({ message: 'User created' });
		}
		catch (err) {
			console.error('Error:', err);
			return reply.status(500).send({ error: 'Internal server error' });
		}
	});


	fastify.get('/users', async (_request, reply) => {
		const users = await getAllUsers();
		return reply.send(users);
	});

	// Nova rota: buscar usuário por username (para o frontend)
	fastify.get('/api/users/:username', async (request, reply) => {
		const { username } = request.params as { username: string };
		const users = await getAllUsers();
		const user = users.find((u: any) => u.username === username);
		if (!user) return reply.status(404).send({ error: 'User not found' });
		return reply.send(user);
	});

	fastify.delete('/users/:id', async (request, reply) => {
		const { id } = request.params as { id: string };

		try {
			await deleteUser(Number(id));
			return reply.send({ message: `User ${id} deleted` });
		}
		catch (err) {
			console.error('Delete error:', err);
			return reply.status(500).send({ error: 'Failed to delete user' });
		}
	});
}
