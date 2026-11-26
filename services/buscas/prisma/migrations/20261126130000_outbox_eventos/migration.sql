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

CREATE INDEX "outbox_eventos_publicado_em_proxima_tentativa_criado_em_idx"
ON "outbox_eventos"("publicado_em", "proxima_tentativa", "criado_em");
