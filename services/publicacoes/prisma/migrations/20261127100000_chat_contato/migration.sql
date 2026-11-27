CREATE TABLE "mensagens_contato" (
    "id" UUID NOT NULL,
    "solicitacao_id" UUID NOT NULL,
    "remetente_id" VARCHAR(64) NOT NULL,
    "texto" VARCHAR(2000) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lido_em" TIMESTAMP(3),

    CONSTRAINT "mensagens_contato_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mensagens_contato_solicitacao_id_criado_em_idx"
ON "mensagens_contato"("solicitacao_id", "criado_em");

CREATE INDEX "mensagens_contato_solicitacao_id_remetente_id_lido_em_idx"
ON "mensagens_contato"("solicitacao_id", "remetente_id", "lido_em");

ALTER TABLE "mensagens_contato"
ADD CONSTRAINT "mensagens_contato_solicitacao_id_fkey"
FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes_contato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
