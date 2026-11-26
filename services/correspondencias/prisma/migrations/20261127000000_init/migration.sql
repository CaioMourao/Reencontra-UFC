CREATE TYPE "StatusCorrespondencia" AS ENUM ('ATIVA', 'ARQUIVADA', 'DEVOLVIDA', 'INCOMPATIVEL');

CREATE TABLE "correspondencias" (
    "id" UUID NOT NULL,
    "publicacao_id" UUID NOT NULL,
    "busca_id" UUID NOT NULL,
    "usuario_busca_id" VARCHAR(64) NOT NULL,
    "usuario_publicacao_id" VARCHAR(64) NOT NULL,
    "referencia" VARCHAR(24) NOT NULL,
    "categoria" VARCHAR(60) NOT NULL,
    "palavras_em_comum" TEXT[] NOT NULL,
    "local_perdido" VARCHAR(120),
    "status" "StatusCorrespondencia" NOT NULL DEFAULT 'ATIVA',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "correspondencias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eventos_processados" (
    "id" UUID NOT NULL,
    "tipo" VARCHAR(120) NOT NULL,
    "processado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eventos_processados_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_eventos" (
    "id" UUID NOT NULL,
    "tipo" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proxima_tentativa" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_em" TIMESTAMP(3),
    CONSTRAINT "outbox_eventos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "correspondencias_publicacao_id_busca_id_key" ON "correspondencias"("publicacao_id", "busca_id");
CREATE INDEX "correspondencias_usuario_busca_id_status_atualizado_em_idx" ON "correspondencias"("usuario_busca_id", "status", "atualizado_em");
CREATE INDEX "correspondencias_publicacao_id_status_idx" ON "correspondencias"("publicacao_id", "status");
CREATE INDEX "outbox_eventos_publicado_em_proxima_tentativa_criado_em_idx" ON "outbox_eventos"("publicado_em", "proxima_tentativa", "criado_em");
