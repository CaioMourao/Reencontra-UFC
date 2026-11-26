CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "StatusBusca" AS ENUM ('ATIVA', 'ARQUIVADA');

CREATE TABLE "buscas" (
    "id" UUID NOT NULL,
    "usuario_id" VARCHAR(64) NOT NULL,
    "categoria" VARCHAR(60) NOT NULL,
    "categoria_normalizada" VARCHAR(60) NOT NULL,
    "palavras_chave" TEXT[] NOT NULL,
    "palavras_normalizadas" TEXT[] NOT NULL,
    "data_inicio" DATE,
    "data_fim" DATE,
    "status" "StatusBusca" NOT NULL DEFAULT 'ATIVA',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "arquivada_em" TIMESTAMP(3),

    CONSTRAINT "buscas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "buscas_usuario_id_status_criado_em_idx"
ON "buscas"("usuario_id", "status", "criado_em");

CREATE INDEX "buscas_status_categoria_normalizada_idx"
ON "buscas"("status", "categoria_normalizada");
