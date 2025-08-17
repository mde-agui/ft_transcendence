import db from '../db/database.js';
import bcrypt from 'bcrypt';
import { User } from '../types/user.js';
import { createTeamMember } from './teamService.js';
import { createUserStats } from './statsService.js';

// Manually promisify db.run
function runAsync(query: string, params: any[] = []): Promise<void> {
return new Promise((resolve, reject) => {
	db.run(query, params, function (err) {
	if (err) reject(err);
	else resolve();
	});
});
}

// Manually promisify db.get
function getAsync<T = any>(query: string, params: any[] = []): Promise<T | undefined> {
return new Promise((resolve, reject) => {
	db.get(query, params, (err, row) => {
	if (err) reject(err);
	else resolve(row as T);
	});
});
}

// Manually promisify db.all
function allAsync<T = any>(query: string, params: any[] = []): Promise<T[]> {
return new Promise((resolve, reject) => {
	db.all(query, params, (err, rows) => {
	if (err) reject(err);
	else resolve(rows as T[]);
	});
});
}

const validTeams = {
	'HACKTIVISTS': 'hacktivists',
	'BUG BUSTERS': 'bug_busters',
	'LOGIC LEAGUE': 'logic_league',
	'CODE ALLIANCE': 'code_allience'
};

// 🟢 Create a new user with hashed password
export async function createUser(name: string, username: string, team: string, password: string): Promise<void> {
	const teamKey = validTeams[team.toUpperCase() as keyof typeof validTeams];
	if (!teamKey) {
		throw new Error('Invalid team name');
	}

	const existingUser = await getUserByUsername(username);
	if (existingUser) {
		throw new Error('Username already exists');
	}

	const hashedPassword = await bcrypt.hash(password, 10);
	const query = `INSERT INTO users (name, username, team, password) VALUES (?, ?, ?, ?)`;
	await runAsync(query, [name, username, team, hashedPassword]);

	await createTeamMember(teamKey, username);

	const newUser = await getUserByUsername(username);
	if (!newUser)
		throw new Error('Failed to retrieve newly created user');
	const userId = newUser.id;
	await createUserStats(userId);

}

// 🔵 Get all users
export async function getAllUsers(): Promise<User[]> {
	const query = `SELECT * FROM users`;
	return await allAsync<User>(query);
}

// 🔍 Get user by username
export async function getUserByUsername(username: string): Promise<User | undefined> {
	const query = `SELECT * FROM users WHERE username = ?`;
	return await getAsync<User>(query, [username]);
}

// 🟡 Update user info (not password)
export async function updateUser(id: number, name: string, team: string): Promise<void> {
	const query = `UPDATE users SET name = ?, team = ? WHERE id = ?`;
	await runAsync(query, [name, team, id]);
}

// 🔴 Delete user
export async function deleteUser(id: number): Promise<void> {
	const query = `DELETE FROM users WHERE id = ?`;
	await runAsync(query, [id]);
}
