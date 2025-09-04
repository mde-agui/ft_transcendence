import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { getEncryptionKey } from './services/vault/vault.js';
import { decryptFile, encryptFile } from './services/vault/encrypt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const encryptedPath = path.join(__dirname, '..', '..',  'data', 'database.db.enc');

const decryptedPath = path.join(__dirname, '..', 'data', 'database.db');
const dataDir = path.dirname(decryptedPath);

const keyPath = path.join(process.cwd(), 'certs', 'key.pem');
const certPath = path.join(process.cwd(), 'certs', 'cert.pem');

let httpsOptions;
try {
    console.log("LOGSSSSS SAO ESTES: ", encryptedPath);
    console.log('🔍 Looking for TLS certs at:', keyPath, certPath);
    httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
    };
    console.log('✅ TLS certificates loaded');
} catch (err: unknown) {
    if (err instanceof Error) {
        console.error('❌ Failed to load TLS certificates:', err.message);
    } else {
        console.error('❌ Failed to load TLS certificates (non-Error):', err);
    }
    process.exit(1);
}

const fastify = Fastify({
    logger: true,
    https: httpsOptions,
});

import { waitForVaultReady } from './services/vault/waitForVault.js';
async function start() {
    let key: string;

    try {
        console.log('🔑 Fetching encryption key from Vault...');
        await waitForVaultReady();
        key = await getEncryptionKey();
        console.log('✅ Encryption key retrieved');
    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error('❌ Error fetching encryption key:', err.message);
        } else {
            console.error('❌ Error fetching encryption key (non-Error):', err);
        }
        process.exit(1);
    }

    try {
        if (!fs.existsSync(dataDir)) {
            console.log('📁 Creating data directory...');
            fs.mkdirSync(dataDir, { recursive: true });
        }

        if (!fs.existsSync(encryptedPath)) {
            console.warn('⚠️ Encrypted database not found. Skipping decryption for now.');
        } else {
            console.log('🔓 Encrypted DB found. Decrypting...');
            await decryptFile(encryptedPath, decryptedPath, key);
            console.log('✅ Database decrypted');

            const stats = fs.statSync(decryptedPath);
            if (stats.size === 0) {
                console.warn('⚠️ Decrypted DB is empty. You may need to initialize it.');
            }
        }

        console.log('📋 Initializing database...');
        await import('../backend/db/database.js');
        console.log('✅ Database initialized');

        await fastify.register(fastifyWebsocket);
        await fastify.register(fastifyCors, { origin: true });

        const pagesPath = path.join(process.cwd(), 'dist', 'frontend', 'pages');
        console.log('📁 Serving static pages from:', pagesPath);

        await fastify.register(fastifyStatic, {
            root: pagesPath,
            prefix: '/',
            index: ['index.html'],
        });

        console.log('🔌 Registering routes...');
        const {
            userRoutes, tournamentRoutes, registerTeamRoutes,
            gameRoutes, statsRoutes, authRoutes, websocketMatchmakingRoutes,
            gameSocketRoutes, matchHistoryRoutes, userProfileRoutes,
            friendsRoutes
        } = await import('./routes/routes.js');

        await fastify.register(matchHistoryRoutes);
        await fastify.register(userProfileRoutes);
        await fastify.register(friendsRoutes);
        await fastify.register(userRoutes);
        await fastify.register(tournamentRoutes);
        await fastify.register(registerTeamRoutes);
        await fastify.register(gameRoutes);
        await fastify.register(statsRoutes);
        await fastify.register(authRoutes);
        await fastify.register(websocketMatchmakingRoutes);
        await fastify.register(gameSocketRoutes);
        console.log('✅ Routes registered');

        fastify.get('/healthz', async (request, reply) => {
            reply.send({ status: 'ok' });
        });

        try {
            await fastify.listen({ port: 3000, host: '0.0.0.0' });
            console.log('✅ Server running at https://localhost:3000');
        } catch (err: unknown) {
            if (err instanceof Error) {
                console.error('❌ Failed to start Fastify server:', err.message);
            } else {
                console.error('❌ Failed to start Fastify server (non-Error):', err);
            }
            process.exit(1);
        }

        const shutdown = async () => {
            try {
                if (fs.existsSync(decryptedPath)) {
                    console.log('🔒 Encrypting database before shutdown...');
                    await encryptFile(decryptedPath, encryptedPath, key);
                    fs.unlinkSync(decryptedPath);
                    console.log('✅ Database encrypted and decrypted copy removed');
                }
            } catch (err: unknown) {
                if (err instanceof Error) {
                    console.error('❌ Error during shutdown encryption:', err.message);
                } else {
                    console.error('❌ Error during shutdown encryption (non-Error):', err);
                }
            }
            process.exit();
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
        process.on('exit', shutdown);

    } catch (err: unknown) {
        if (err instanceof Error) {
            console.error('❌ Server startup failed:', err.message);
            console.error(err.stack);
        } else {
            console.error('❌ Server startup failed with non-Error:', err);
        }
        process.exit(1);
    }
}

start();
