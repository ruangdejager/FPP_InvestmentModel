import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UPLOAD_DIR } from '../config.js';
import { db } from '../db/client.js';
import { documents, properties } from '../db/schema.js';
import { newId } from '../lib/id.js';

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.ms-excel',
]);

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/documents', async (request) => {
    const query = z.object({ ownerType: z.enum(['property', 'comparable']), ownerId: z.string() }).parse(request.query);
    return db
      .select()
      .from(documents)
      .where(and(eq(documents.ownerType, query.ownerType), eq(documents.ownerId, query.ownerId)))
      .orderBy(desc(documents.uploadedAt))
      .all();
  });

  /**
   * Uploads land under DATA_DIR/uploads with a generated name, so a file the
   * user names can never escape the directory or overwrite another.
   */
  app.post('/api/documents', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file was uploaded.' });

    const ownerType = (data.fields.ownerType as { value?: string } | undefined)?.value;
    const ownerId = (data.fields.ownerId as { value?: string } | undefined)?.value;
    const kind = (data.fields.kind as { value?: string } | undefined)?.value ?? null;

    if (ownerType !== 'property' && ownerType !== 'comparable') {
      return reply.status(400).send({ error: 'ownerType must be property or comparable.' });
    }
    if (!ownerId) return reply.status(400).send({ error: 'ownerId is required.' });
    if (!ALLOWED_MIME.has(data.mimetype)) {
      return reply.status(400).send({ error: `Files of type ${data.mimetype} are not accepted.` });
    }

    const id = newId('doc');
    const storedFilename = `${id}${extname(data.filename).slice(0, 10)}`;
    const target = resolve(UPLOAD_DIR, storedFilename);
    await pipeline(data.file, createWriteStream(target));

    if (data.file.truncated) {
      await unlink(target).catch(() => undefined);
      return reply.status(413).send({ error: 'That file is larger than the 20 MB limit.' });
    }

    db.insert(documents)
      .values({
        id,
        ownerType,
        ownerId,
        kind,
        originalFilename: data.filename,
        storedFilename,
        mimeType: data.mimetype,
        size: data.file.bytesRead,
        uploadedBy: request.director?.email ?? null,
      })
      .run();

    // A conduct rules document is the evidence behind the hard gate, so record
    // the link on the property itself.
    if (ownerType === 'property' && kind === 'str_rules') {
      db.update(properties).set({ strRulesDocumentId: id }).where(eq(properties.id, ownerId)).run();
    }

    return reply.status(201).send(db.select().from(documents).where(eq(documents.id, id)).get());
  });

  app.get('/api/documents/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const document = db.select().from(documents).where(eq(documents.id, id)).get();
    if (!document) return reply.status(404).send({ error: 'No such document.' });

    return reply
      .type(document.mimeType)
      .header('content-disposition', `attachment; filename="${encodeURIComponent(document.originalFilename)}"`)
      .send((await import('node:fs')).createReadStream(join(UPLOAD_DIR, document.storedFilename)));
  });

  app.delete('/api/documents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const document = db.select().from(documents).where(eq(documents.id, id)).get();
    if (!document) return reply.status(404).send({ error: 'No such document.' });
    await unlink(join(UPLOAD_DIR, document.storedFilename)).catch(() => undefined);
    db.delete(documents).where(eq(documents.id, id)).run();
    return reply.status(204).send();
  });
}
