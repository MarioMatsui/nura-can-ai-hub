import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const POLICY_MARKDOWN = `# Política de Privacidade

**Nuracan – Assistente de IA para Cannabis Medicinal**

_Última atualização: abril de 2025_

---

## 1. Apresentação

A presente Política de Privacidade descreve como a plataforma Nuracan coleta, utiliza, armazena e protege as informações pessoais e dados de saúde dos seus usuários. O Nuracan é um agente de inteligência artificial especializado em cannabis medicinal, desenvolvido para auxiliar pacientes e profissionais de saúde na consulta de informações, análise de documentos clínicos e sugestões de dosagens, sendo sempre o médico responsável a autoridade final nas decisões terapêuticas.

Ao utilizar a plataforma Nuracan, você concorda com os termos desta Política de Privacidade. Recomendamos a leitura integral deste documento antes de utilizar nossos serviços.

---

## 2. Dados Coletados

O Nuracan pode coletar as seguintes categorias de dados:

**2.1 Dados de Identificação:**
- Nome completo
- Endereço de e-mail
- Número de telefone (opcional)
- Data de nascimento

**2.2 Dados de Saúde (Dados Sensíveis):**
- Prontuários médicos enviados pelo usuário
- Receitas e prescrições médicas
- Histórico de condições de saúde informadas voluntariamente
- Informações sobre medicamentos e tratamentos em uso
- Resultados de exames e laudos clínicos

**2.3 Dados de Uso da Plataforma:**
- Histórico de interações com o agente de IA
- Consultas realizadas e documentos enviados
- Endereço IP e informações do dispositivo
- Logs de acesso e metadados de sessão

Os dados de saúde são classificados como dados sensíveis nos termos da Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018) e recebem tratamento especial e reforçado de proteção.

---

## 3. Finalidade do Tratamento dos Dados

Os dados coletados são utilizados exclusivamente para as seguintes finalidades:

- Fornecer funcionalidades personalizadas de consulta e análise de informações sobre cannabis medicinal
- Processar e cruzar documentos clínicos enviados pelo usuário para geração de sugestões de dosagens
- Melhorar os modelos de inteligência artificial e a qualidade das respostas do agente Nuracan
- Garantir a segurança e a integridade da plataforma
- Cumprir obrigações legais e regulatórias
- Comunicar atualizações relevantes sobre a plataforma, mediante consentimento do usuário

O Nuracan não utiliza dados de saúde para fins publicitários, de marketing ou para compartilhamento comercial com terceiros.

---

## 4. Natureza da IA e Limitações de Responsabilidade

O Nuracan é uma ferramenta de apoio à decisão médica, fundamentada na análise de literatura científica. É fundamental que o usuário compreenda:

- As sugestões, análises e informações fornecidas pelo agente Nuracan têm caráter exclusivamente informativo e de auxílio
- Nenhuma recomendação gerada pela plataforma substitui a avaliação, prescrição ou decisão de um médico habilitado
- O profissional de saúde é o único responsável pela conduta terapêutica adotada
- O Nuracan não realiza diagnósticos médicos
- O usuário assume a responsabilidade por utilizar as informações de forma adequada e em conjunto com orientação médica

---

## 5. Base Legal para o Tratamento de Dados

O tratamento de dados pessoais pelo Nuracan é realizado com fundamento nas seguintes bases legais previstas na LGPD:

- **Consentimento do titular** (Art. 7º, I e Art. 11, I da LGPD): para dados fornecidos voluntariamente, especialmente dados de saúde
- **Legítimo interesse** (Art. 7º, IX): para melhoria dos serviços e segurança da plataforma
- **Proteção da vida e da tutela da saúde** (Art. 11, II, f): para o processamento de dados de saúde estritamente necessários à prestação do serviço
- **Cumprimento de obrigação legal** (Art. 7º, II): quando exigido por autoridades competentes

---

## 6. Compartilhamento de Dados

O Nuracan não vende, aluga ou comercializa dados pessoais dos usuários. O compartilhamento de dados ocorre apenas nas seguintes situações:

- Com prestadores de serviços de infraestrutura tecnológica (hospedagem, armazenamento em nuvem), sob obrigação contratual de confidencialidade
- Com autoridades governamentais ou judiciais, quando exigido por lei ou ordem judicial
- Com o médico responsável do paciente, mediante autorização expressa do usuário

Todo compartilhamento ocorre com garantias contratuais de proteção equivalentes às adotadas pelo Nuracan.

---

## 7. Armazenamento e Segurança dos Dados

O Nuracan adota medidas técnicas e administrativas robustas para proteger os dados dos usuários:

- Criptografia de dados em trânsito (TLS/HTTPS) e em repouso (AES-256)
- Controle de acesso restrito baseado em perfis e necessidade
- Monitoramento contínuo de segurança e detecção de incidentes
- Backups periódicos com redundância geográfica
- Política interna de segurança da informação para colaboradores e parceiros

Os dados são armazenados em servidores localizados no Brasil ou em países que oferecem nível adequado de proteção de dados, conforme os requisitos da LGPD.

---

## 8. Retenção de Dados

Os dados pessoais são retidos pelo período necessário às finalidades para as quais foram coletados, observando:

- **Dados de saúde:** retidos pelo prazo mínimo exigido pela legislação sanitária e de prontuários (Art. 1º da Resolução CFM nº 1.821/2007 – 20 anos)
- **Dados de conta e interações:** retidos durante a vigência da relação contratual e por até 5 anos após o encerramento, para fins de auditoria e cumprimento legal
- **Logs de acesso:** retidos por 6 meses, conforme o Marco Civil da Internet (Lei nº 12.965/2014)

Após o prazo de retenção aplicável, os dados são anonimizados ou excluídos de forma segura.

---

## 9. Direitos dos Titulares

Em conformidade com a LGPD, o usuário possui os seguintes direitos em relação aos seus dados pessoais:

- Confirmação da existência de tratamento de seus dados
- Acesso aos dados que mantemos sobre você
- Correção de dados incompletos, inexatos ou desatualizados
- Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade com a LGPD
- Portabilidade dos dados a outro fornecedor de serviço
- Eliminação dos dados tratados com base no consentimento
- Informação sobre as entidades com as quais compartilhamos seus dados
- Revogação do consentimento a qualquer momento

Para exercer seus direitos, entre em contato com nosso Encarregado de Dados (DPO) pelo e-mail: **info@nuracan.com.br**. Responderemos às solicitações em até 15 dias úteis.

---

## 10. Cookies e Tecnologias de Rastreamento

A plataforma Nuracan utiliza cookies e tecnologias similares para:

- Manter a sessão do usuário autenticada
- Lembrar preferências de uso
- Coletar estatísticas agregadas e anônimas de uso da plataforma

Cookies estritamente necessários são ativados automaticamente. Cookies analíticos ou de desempenho dependem do consentimento do usuário, podendo ser gerenciados nas configurações da plataforma ou do navegador.

---

## 11. Menores de Idade

O Nuracan não é destinado a menores de 18 anos. Não coletamos conscientemente dados pessoais de menores. Caso identifiquemos inadvertidamente a coleta de dados de um menor, procederemos com a exclusão imediata dessas informações. Responsáveis legais que identifiquem tal situação devem entrar em contato conosco imediatamente.

---

## 12. Alterações nesta Política

O Nuracan reserva-se o direito de atualizar esta Política de Privacidade periodicamente, para refletir mudanças nas práticas de tratamento de dados, novos requisitos legais ou melhorias nos serviços. Alterações relevantes serão comunicadas por e-mail ou notificação na plataforma com antecedência mínima de 15 dias. O uso continuado dos serviços após a publicação das alterações implica a aceitação dos novos termos.

---

## 13. Contato e Encarregado de Dados (DPO)

Para dúvidas, solicitações ou reclamações relacionadas ao tratamento de dados pessoais, entre em contato com:

**Encarregado de Proteção de Dados (DPO) – Nuracan**
E-mail: info@nuracan.com.br

Você também pode contatar a Autoridade Nacional de Proteção de Dados (ANPD) pelo site: [www.gov.br/anpd](https://www.gov.br/anpd)

---

_Esta Política de Privacidade entra em vigor na data de sua publicação._

**Nuracan – Cuidando da sua saúde com tecnologia e responsabilidade.**`;

const Privacidade = () => {
  useEffect(() => {
    const previous = document.title;
    document.title = "Política de Privacidade — NuraCan AI";
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
            {POLICY_MARKDOWN}
          </ReactMarkdown>
        </article>
      </main>
      <Footer />
    </div>
  );
};

export default Privacidade;
