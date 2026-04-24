import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const TERMS_MARKDOWN = `# Termos de Serviço

**Nuracan – Assistente de IA para Cannabis Medicinal**

_Última atualização: abril de 2025_

---

## 1. Aceitação dos Termos

Ao acessar ou utilizar a plataforma Nuracan, você declara que leu, compreendeu e concorda com os presentes Termos de Serviço, bem como com nossa [Política de Privacidade](#). Caso não concorde com qualquer disposição aqui prevista, solicitamos que não utilize nossos serviços.

Estes Termos constituem um contrato vinculante entre você (doravante "Usuário") e a plataforma Nuracan (doravante "Nuracan" ou "Plataforma").

---

## 2. Descrição do Serviço

O Nuracan é uma plataforma de inteligência artificial especializada em cannabis medicinal, cujos serviços incluem:

- Consulta interativa com agente de IA treinado em literatura científica sobre cannabis medicinal
- Análise e processamento de documentos clínicos (prontuários, receitas, laudos) enviados pelo Usuário
- Cruzamento de informações para geração de sugestões de dosagens e condutas
- Disponibilização de informações atualizadas sobre pesquisas e regulamentações relacionadas ao tema

O Nuracan é uma **ferramenta de apoio à decisão clínica**, não substituindo em nenhuma hipótese a consulta, avaliação ou prescrição de um médico devidamente habilitado.

---

## 3. Elegibilidade

Para utilizar o Nuracan, o Usuário deve:

- Ter 18 anos de idade ou mais
- Ser capaz civilmente, nos termos da legislação brasileira
- Fornecer informações verdadeiras, precisas e atualizadas no momento do cadastro
- Não estar impedido de celebrar contratos por disposição legal ou judicial

O Nuracan é voltado a pacientes, cuidadores e profissionais de saúde interessados em cannabis medicinal. Profissionais de saúde devem observar adicionalmente as normas éticas e regulatórias de seus respectivos conselhos de classe.

---

## 4. Cadastro e Conta do Usuário

**4.1** Para acessar as funcionalidades completas da plataforma, o Usuário deverá criar uma conta fornecendo os dados solicitados no formulário de cadastro.

**4.2** O Usuário é integralmente responsável por:
- Manter a confidencialidade de suas credenciais de acesso (login e senha)
- Todas as atividades realizadas sob sua conta
- Notificar imediatamente o Nuracan em caso de uso não autorizado de sua conta, pelo e-mail **info@nuracan.ai**

**4.3** O Nuracan reserva-se o direito de recusar cadastros, cancelar contas ou remover conteúdos a seu exclusivo critério, especialmente em casos de violação destes Termos.

---

## 5. Natureza da IA e Limitações Essenciais

Este é um ponto fundamental dos presentes Termos. O Usuário declara expressamente compreender que:

- O Nuracan é uma **ferramenta de apoio**, e suas respostas têm caráter exclusivamente **informativo e orientativo**
- **Nenhuma informação, sugestão ou análise gerada pelo Nuracan constitui diagnóstico, prescrição ou conduta médica**
- A **decisão terapêutica final é de responsabilidade exclusiva do médico assistente**
- O Nuracan não substitui consultas médicas presenciais ou remotas realizadas por profissional habilitado
- Resultados e sugestões gerados pela IA podem conter imprecisões e devem sempre ser validados por profissional de saúde
- O uso das informações fornecidas pela plataforma sem orientação médica é de **inteira responsabilidade do Usuário**

---

## 6. Uso Permitido

O Usuário compromete-se a utilizar a plataforma Nuracan somente para fins lícitos e de acordo com estes Termos. São usos permitidos:

- Consultar informações sobre cannabis medicinal para fins pessoais ou profissionais
- Enviar documentos clínicos próprios ou de pacientes sob sua responsabilidade (com o devido consentimento)
- Utilizar as sugestões da IA como insumo complementar à avaliação médica

---

## 7. Uso Proibido

É expressamente vedado ao Usuário:

- Utilizar a plataforma para fins ilegais, antiéticos ou que violem direitos de terceiros
- Tentar contornar, hackear ou comprometer os sistemas de segurança da plataforma
- Inserir dados falsos, de terceiros sem autorização ou informações fraudulentas
- Utilizar o Nuracan para substituir, simular ou exercer ilegalmente a medicina
- Reproduzir, copiar, distribuir ou comercializar o conteúdo gerado pela plataforma sem autorização prévia e por escrito
- Enviar vírus, malware ou qualquer código malicioso à plataforma
- Realizar engenharia reversa, descompilar ou tentar extrair o código-fonte dos sistemas do Nuracan
- Utilizar scripts, bots ou automações para acessar a plataforma de forma não autorizada
- Compartilhar credenciais de acesso com terceiros

---

## 8. Documentos e Dados Enviados pelo Usuário

**8.1** Ao enviar documentos (prontuários, receitas, laudos, exames etc.) para a plataforma, o Usuário declara:
- Ser o titular dos dados ou possuir autorização expressa do titular para o envio
- Ter ciência de que o conteúdo será processado pelo agente de IA para fins de análise e geração de respostas

**8.2** O Nuracan não reivindica propriedade sobre os documentos enviados pelo Usuário. O tratamento desses dados é regido pela nossa Política de Privacidade.

**8.3** O Usuário é o único responsável pela veracidade, integridade e legalidade dos documentos enviados.

---

## 9. Propriedade Intelectual

**9.1** Todo o conteúdo da plataforma Nuracan — incluindo, mas não se limitando a, software, algoritmos, modelos de IA, textos, interfaces, logotipos, marcas e design — é de propriedade exclusiva do Nuracan ou de seus licenciantes, sendo protegido pela legislação brasileira de propriedade intelectual.

**9.2** O Usuário recebe uma licença limitada, não exclusiva, intransferível e revogável para utilizar a plataforma exclusivamente para os fins previstos nestes Termos.

**9.3** É vedada qualquer reprodução, distribuição, modificação ou uso comercial do conteúdo da plataforma sem autorização prévia e expressa do Nuracan.

---

## 10. Planos e Pagamentos

**10.1** O Nuracan pode oferecer planos gratuitos e pagos. As condições, funcionalidades e valores de cada plano são descritos na página de preços da plataforma e podem ser alterados mediante aviso prévio.

**10.2** Pagamentos realizados são processados por parceiros de pagamento certificados. O Nuracan não armazena dados de cartão de crédito ou informações financeiras sensíveis.

**10.3** Cancelamentos e reembolsos seguem a política específica de cada plano, disponível na plataforma. Em caso de dúvidas, entre em contato pelo e-mail **info@nuracan.ai**.

---

## 11. Disponibilidade e Manutenção

**11.1** O Nuracan envida seus melhores esforços para manter a plataforma disponível de forma contínua, mas não garante disponibilidade ininterrupta.

**11.2** A plataforma pode ficar temporariamente indisponível em razão de manutenções programadas, atualizações de sistema ou situações de força maior. Manutenções programadas serão comunicadas com antecedência sempre que possível.

**11.3** O Nuracan não se responsabiliza por prejuízos decorrentes de indisponibilidade temporária da plataforma.

---

## 12. Limitação de Responsabilidade

Na máxima extensão permitida pela legislação aplicável:

- O Nuracan não se responsabiliza por danos diretos, indiretos, incidentais, especiais ou consequenciais decorrentes do uso ou da impossibilidade de uso da plataforma
- O Nuracan não se responsabiliza por decisões médicas ou de saúde tomadas com base nas informações fornecidas pela IA
- O Nuracan não garante que as respostas do agente de IA estejam livres de erros ou que atendam às necessidades específicas de cada Usuário
- A responsabilidade total do Nuracan perante o Usuário, em qualquer hipótese, fica limitada ao valor pago pelo Usuário pelos serviços nos últimos 3 meses

---

## 13. Isenção de Garantias

A plataforma Nuracan é fornecida "no estado em que se encontra" (_as is_), sem garantias de qualquer natureza, expressas ou implícitas, incluindo, mas não se limitando a, garantias de comercialização, adequação a uma finalidade específica ou não infração de direitos de terceiros.

---

## 14. Rescisão

**14.1** O Usuário pode encerrar sua conta a qualquer momento, por meio das configurações da plataforma ou pelo e-mail **info@nuracan.ai**.

**14.2** O Nuracan pode suspender ou encerrar o acesso do Usuário, a qualquer tempo e sem aviso prévio, nos seguintes casos:
- Violação de quaisquer disposições destes Termos
- Uso da plataforma de forma fraudulenta, ilegal ou prejudicial a terceiros
- Determinação judicial ou de autoridade competente
- Descontinuação do serviço

**14.3** O encerramento da conta não exclui obrigações anteriormente assumidas pelo Usuário.

---

## 15. Privacidade

O tratamento dos dados pessoais do Usuário é regido pela nossa [Política de Privacidade](#), que integra estes Termos por referência. Ao aceitar estes Termos, o Usuário também concorda com as práticas descritas na Política de Privacidade.

---

## 16. Alterações nos Termos

O Nuracan reserva-se o direito de modificar estes Termos a qualquer momento. Alterações relevantes serão comunicadas por e-mail ou por notificação na própria plataforma com antecedência mínima de 15 dias. O uso continuado da plataforma após a vigência das alterações implica a aceitação dos novos Termos.

---

## 17. Lei Aplicável e Foro

Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de domicílio do Usuário para dirimir quaisquer controvérsias decorrentes destes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja, salvo disposição legal em contrário.

---

## 18. Disposições Gerais

**18.1** Caso qualquer disposição destes Termos seja considerada inválida ou inaplicável, as demais disposições permanecerão em pleno vigor e efeito.

**18.2** A omissão do Nuracan em exigir o cumprimento de qualquer disposição destes Termos não constituirá renúncia ao direito de fazê-lo posteriormente.

**18.3** Estes Termos constituem o acordo integral entre o Usuário e o Nuracan a respeito do objeto aqui tratado, substituindo quaisquer acordos anteriores sobre o mesmo tema.

---

## 19. Contato

Para dúvidas, sugestões ou solicitações relacionadas a estes Termos de Serviço, entre em contato:

**Nuracan**
E-mail: [info@nuracan.ai](mailto:info@nuracan.ai)

---

_Estes Termos de Serviço entram em vigor na data de sua publicação._

**Nuracan – Cuidando da sua saúde com tecnologia e responsabilidade.**`;

const TermosUso = () => {
  useEffect(() => {
    const previous = document.title;
    document.title = "Termos de Serviço — NuraCan AI";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        <article className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pt-32 sm:pt-40 pb-16">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-3xl sm:text-4xl font-bold mb-6 text-foreground">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl sm:text-2xl font-bold mt-10 mb-4 text-foreground">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-semibold mt-6 mb-3 text-foreground">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="text-base leading-relaxed text-muted-foreground mb-4">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc pl-6 space-y-2 mb-4 text-muted-foreground">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-6 space-y-2 mb-4 text-muted-foreground">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="leading-relaxed">{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">
                  {children}
                </strong>
              ),
              em: ({ children }) => (
                <em className="italic text-muted-foreground">{children}</em>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {children}
                </a>
              ),
              hr: () => <hr className="my-8 border-border" />,
            }}
          >
            {TERMS_MARKDOWN}
          </ReactMarkdown>
        </article>
      </main>
      <Footer />
    </div>
  );
};

export default TermosUso;
