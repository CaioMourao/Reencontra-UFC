CREATE TABLE "avisos" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "correspondencia_id" UUID NOT NULL,
    "usuario_id" VARCHAR(64) NOT NULL,
    "publicacao_id" UUID NOT NULL,
    "busca_id" UUID NOT NULL,
    "referencia" VARCHAR(24) NOT NULL,
    "categoria" VARCHAR(60) NOT NULL,
    "palavras_em_comum" TEXT[] NOT NULL,
    "local_perdido" VARCHAR(120),
    "ocorrido_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lido_em" TIMESTAMP(3),

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "avisos_event_id_key" ON "avisos"("event_id");
CREATE INDEX "avisos_usuario_id_lido_em_criado_em_idx" ON "avisos"("usuario_id", "lido_em", "criado_em");
