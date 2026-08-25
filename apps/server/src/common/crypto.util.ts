import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { Global, Inject, Injectable, Module } from '@nestjs/common';

export const KITHLINK_MASTER_KEY = 'KITHLINK_MASTER_KEY';

interface SealedEnvelope {
  v: 1;
  iv: string;
  tag: string;
  ct: string;
  wrappedIv: string;
  wrappedTag: string;
  wrappedDek: string;
}

@Injectable()
export class CryptoUtil {
  private readonly kek: Buffer;

  constructor(@Inject(KITHLINK_MASTER_KEY) masterKeyB64?: string) {
    const raw = masterKeyB64 ?? process.env.KITHLINK_MASTER_KEY;
    let master: Buffer;
    if (raw) {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length !== 32) throw new Error('KITHLINK_MASTER_KEY must decode to 32 bytes');
      master = decoded;
    } else {
      console.warn('[crypto] KITHLINK_MASTER_KEY unset; deriving master key from DATABASE_URL hash (dev only)');
      master = createHash('sha256').update(process.env.DATABASE_URL ?? '').digest();
    }
    this.kek = Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), 'kithlink:v1', 32));
  }

  seal(plaintext: string): string {
    const dek = randomBytes(32);
    const iv = randomBytes(12);
    const dataCipher = createCipheriv('aes-256-gcm', dek, iv);
    const ct = Buffer.concat([dataCipher.update(plaintext, 'utf8'), dataCipher.final()]);
    const tag = dataCipher.getAuthTag();

    const wrappedIv = randomBytes(12);
    const wrapCipher = createCipheriv('aes-256-gcm', this.kek, wrappedIv);
    const wrappedDek = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
    const wrappedTag = wrapCipher.getAuthTag();

    const envelope: SealedEnvelope = {
      v: 1,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: ct.toString('base64'),
      wrappedIv: wrappedIv.toString('base64'),
      wrappedTag: wrappedTag.toString('base64'),
      wrappedDek: wrappedDek.toString('base64'),
    };
    return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
  }

  open(sealed: string): string {
    let envelope: SealedEnvelope;
    try {
      envelope = JSON.parse(Buffer.from(sealed, 'base64').toString('utf8')) as SealedEnvelope;
    } catch {
      throw new Error('sealed payload malformed');
    }
    const wrapDecipher = createDecipheriv(
      'aes-256-gcm',
      this.kek,
      Buffer.from(envelope.wrappedIv, 'base64'),
    );
    wrapDecipher.setAuthTag(Buffer.from(envelope.wrappedTag, 'base64'));
    const dek = Buffer.concat([
      wrapDecipher.update(Buffer.from(envelope.wrappedDek, 'base64')),
      wrapDecipher.final(),
    ]);
    const dataDecipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(envelope.iv, 'base64'));
    dataDecipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([
      dataDecipher.update(Buffer.from(envelope.ct, 'base64')),
      dataDecipher.final(),
    ]).toString('utf8');
  }

  sha256Hex(data: Uint8Array): string {
    return createHash('sha256').update(data).digest('hex');
  }
}

@Global()
@Module({
  providers: [
    CryptoUtil,
    {
      provide: KITHLINK_MASTER_KEY,
      useValue: process.env.KITHLINK_MASTER_KEY,
    },
  ],
  exports: [CryptoUtil, KITHLINK_MASTER_KEY],
})
export class CryptoModule {}
