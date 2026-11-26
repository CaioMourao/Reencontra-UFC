import { Prisma } from '@prisma/client';

export function ehEventoDuplicado(erro) {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}
