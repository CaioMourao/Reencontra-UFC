CREATE TYPE "TipoAviso" AS ENUM ('CORRESPONDENCIA', 'CONTATO_SOLICITADO');

ALTER TABLE "avisos"
ADD COLUMN "tipo" "TipoAviso" NOT NULL DEFAULT 'CORRESPONDENCIA',
ADD COLUMN "solicitacao_contato_id" UUID;

ALTER TABLE "avisos"
ALTER COLUMN "correspondencia_id" DROP NOT NULL,
ALTER COLUMN "busca_id" DROP NOT NULL,
ALTER COLUMN "categoria" DROP NOT NULL,
ALTER COLUMN "motivo" DROP NOT NULL,
ALTER COLUMN "motivo" DROP DEFAULT,
ALTER COLUMN "palavras_em_comum" SET DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "avisos_solicitacao_contato_id_idx"
ON "avisos"("solicitacao_contato_id");
