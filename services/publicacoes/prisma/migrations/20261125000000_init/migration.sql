CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "StatusPublicacao" AS ENUM ('ABERTA', 'ARQUIVADA', 'DEVOLVIDA');
CREATE TYPE "StatusSolicitacaoContato" AS ENUM ('PENDENTE', 'CONCLUIDA', 'CANCELADA');

CREATE TABLE "publicacoes" (
    "id" UUID NOT NULL,
    "referencia" VARCHAR(24) NOT NULL,
    "usuario_id" VARCHAR(64) NOT NULL,
    "categoria" VARCHAR(60) NOT NULL,
    "descricao" VARCHAR(500) NOT NULL,
    "local_aproximado" VARCHAR(120) NOT NULL,
    "data_encontrado" DATE NOT NULL,
    "status" "StatusPublicacao" NOT NULL DEFAULT 'ABERTA',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "arquivada_em" TIMESTAMP(3),
    "devolvida_em" TIMESTAMP(3),

    CONSTRAINT "publicacoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "solicitacoes_contato" (
    "id" UUID NOT NULL,
    "publicacao_id" UUID NOT NULL,
    "solicitante_id" VARCHAR(64) NOT NULL,
    "codigo_hash" CHAR(64) NOT NULL,
    "codigo_expira_em" TIMESTAMP(3) NOT NULL,
    "status" "StatusSolicitacaoContato" NOT NULL DEFAULT 'PENDENTE',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "concluida_em" TIMESTAMP(3),

    CONSTRAINT "solicitacoes_contato_pkey" PRIMARY KEY ("id")
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

CREATE UNIQUE INDEX "publicacoes_referencia_key" ON "publicacoes"("referencia");
CREATE INDEX "publicacoes_status_data_encontrado_criado_em_idx" ON "publicacoes"("status", "data_encontrado", "criado_em");
CREATE INDEX "publicacoes_usuario_id_status_criado_em_idx" ON "publicacoes"("usuario_id", "status", "criado_em");
CREATE INDEX "publicacoes_categoria_status_idx" ON "publicacoes"("categoria", "status");

CREATE UNIQUE INDEX "solicitacoes_contato_publicacao_id_solicitante_id_key" ON "solicitacoes_contato"("publicacao_id", "solicitante_id");
CREATE UNIQUE INDEX "solicitacoes_contato_publicacao_id_codigo_hash_key" ON "solicitacoes_contato"("publicacao_id", "codigo_hash");
CREATE INDEX "solicitacoes_contato_publicacao_id_status_codigo_expira_em_idx" ON "solicitacoes_contato"("publicacao_id", "status", "codigo_expira_em");
ALTER TABLE "solicitacoes_contato" ADD CONSTRAINT "solicitacoes_contato_publicacao_id_fkey" FOREIGN KEY ("publicacao_id") REFERENCES "publicacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "outbox_eventos_publicado_em_proxima_tentativa_criado_em_idx" ON "outbox_eventos"("publicado_em", "proxima_tentativa", "criado_em");
