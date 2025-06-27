import { WebSocket } from 'ws';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { Writable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import {
  StartMediaUploadMessage,
  MediaChunkMessage,
  EndMediaUploadMessage,
  ServerMessageType,
  ErrorCode,
  ClientMessage,
  ClientMessageType,
} from '../../types/messages';
import { sendMessage } from '../../utils/message-sender';
import * as logger from '../../utils/logger';
import { ConnectionState } from '../connection/connection-state';

// Initialize Firebase Admin SDK
if (!getApps().length) {
  // TODO: Add service account credentials to environment variables
  // const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string);
  initializeApp({
    // credential: cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

interface UploadState {
  writeStream: Writable;
  fileName: string;
  mimeType: string;
}

export class MediaHandler {
  private activeUploads = new Map<string, UploadState>();

  public async handle(connection: ConnectionState, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case ClientMessageType.START_MEDIA_UPLOAD:
        this.handleStartMediaUpload(connection, message as StartMediaUploadMessage);
        break;
      case ClientMessageType.MEDIA_CHUNK:
        this.handleMediaChunk(connection, message as MediaChunkMessage);
        break;
      case ClientMessageType.END_MEDIA_UPLOAD:
        this.handleEndMediaUpload(connection, message as EndMediaUploadMessage);
        break;
    }
  }

  private handleStartMediaUpload(connection: ConnectionState, message: StartMediaUploadMessage) {
    const { id: connectionId, socket } = connection;
    const { fileName, mimeType } = message;
    const bucket = getStorage().bucket();
    const file = bucket.file(`uploads/${uuidv4()}-${fileName}`);
    const writeStream = file.createWriteStream({
      metadata: {
        contentType: mimeType,
      },
    });

    writeStream.on('error', (err) => {
      logger.error(`[${connectionId}] Error uploading to Firebase:`, err);
      sendMessage(socket, connectionId, {
        type: ServerMessageType.ERROR,
        id: message.id,
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Failed to upload file to Firebase Storage.',
      });
      this.activeUploads.delete(connectionId);
    });

    writeStream.on('finish', async () => {
      logger.info(`[${connectionId}] File upload finished for ${fileName}.`);
      await file.makePublic();
      const [url] = await file.getSignedUrl({
          action: 'read',
          expires: '03-09-2491'
      });
      sendMessage(socket, connectionId, {
        type: ServerMessageType.MEDIA_UPLOAD_COMPLETE,
        id: message.id,
        fileUrl: url,
      });
      this.activeUploads.delete(connectionId);
    });

    this.activeUploads.set(connectionId, { writeStream, fileName, mimeType });

    sendMessage(socket, connectionId, {
      type: ServerMessageType.MEDIA_UPLOAD_READY,
      id: message.id,
    });
  };

  private handleMediaChunk(connection: ConnectionState, message: MediaChunkMessage) {
    const { id: connectionId } = connection;
    const uploadState = this.activeUploads.get(connectionId);

    if (!uploadState) {
      logger.warn(`[${connectionId}] Received media chunk without an active upload.`);
      return;
    }

    const chunk = Buffer.from(message.chunk, 'base64');
    uploadState.writeStream.write(chunk);
  };

  private handleEndMediaUpload(connection: ConnectionState, message: EndMediaUploadMessage) {
    const { id: connectionId } = connection;
    const uploadState = this.activeUploads.get(connectionId);

    if (!uploadState) {
      logger.warn(`[${connectionId}] Received end media upload without an active upload.`);
      return;
    }

    uploadState.writeStream.end();
  };
}
