CREATE TABLE "tokens_recuperacao" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_recuperacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tokens_recuperacao_token_hash_key"
    ON "tokens_recuperacao"("token_hash");
CREATE INDEX "tokens_recuperacao_usuario_id_idx"
    ON "tokens_recuperacao"("usuario_id");
CREATE INDEX "tokens_recuperacao_expira_em_idx"
    ON "tokens_recuperacao"("expira_em");

ALTER TABLE "tokens_recuperacao"
    ADD CONSTRAINT "tokens_recuperacao_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
