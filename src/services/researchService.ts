import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSevenStore } from '../store/useSevenStore';
import { ResearchDocument } from '../types';
import { selfHealing } from '../core/selfHealing';
import { storageService } from './storageService';
import { resolveModel } from '../core/geminiClient';
import { Platform } from 'react-native';
import { webSearchService } from './webSearchService';

class ResearchService {
  private static instance: ResearchService;

  private constructor() {}

  /** Escapes user/model-provided strings so they cannot break the HTML layout. */
  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  public static getInstance(): ResearchService {
    if (!ResearchService.instance) {
      ResearchService.instance = new ResearchService();
    }
    return ResearchService.instance;
  }

  /**
   * Generates a deep research document and creates a high-res PDF via expo-print
   */
  public async researchTopicAndCreatePdf(topic: string): Promise<ResearchDocument> {
    const store = useSevenStore.getState();
    const apiKey = store.config.geminiApiKey;
    const userName = store.config.userName || 'SEVEN Commander';

    store.setStatus('thinking');
    store.addTerminalLog(`Research task has been initiated for: "${topic}"`, 'cmd');
    store.addTerminalLog('Querying deep intelligence synthesis matrix...', 'info');

    const isFr = store.config.language === 'fr';
    let title = isFr ? `Synthèse documentée : ${topic}` : `Sourced synthesis: ${topic}`;
    let summary = isFr
      ? `Synthèse de sources publiques concernant ${topic}, préparée pour ${userName}.`
      : `Synthesis of public sources about ${topic}, prepared for ${userName}.`;
    let sections: { heading: string; body: string }[] = [];

    // Ground the report before asking a language model to synthesize it. A
    // generated answer without retrieved evidence is a draft, not research.
    const search = await webSearchService
      .searchWeb(topic, isFr ? 'fr' : 'en')
      .catch(() => ({ query: topic, results: [], summary: '' }));
    const sources = search.results.slice(0, 6).map((source) => ({
      title: source.title,
      url: source.url,
      snippet: source.snippet,
    }));
    store.addTerminalLog(
      sources.length
        ? `GROUNDING: ${sources.length} verifiable source(s) retrieved.`
        : 'GROUNDING UNAVAILABLE: report will be labelled as an unverified draft.',
      sources.length ? 'success' : 'warn'
    );

    // Attempt Gemini synthesis using only the evidence above.

    let generatedViaAi = false;
    if (sources.length > 0 && apiKey && apiKey.trim().length > 5) {
      try {
        store.addTerminalLog('Synthesizing structured multi-section document...', 'cmd');
        const { model } = await resolveModel(apiKey, {
          generationConfig: { responseMimeType: 'application/json' },
        });

        const evidence = sources.length
          ? sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.snippet || ''}\n${s.url}`).join('\n\n')
          : 'NO VERIFIED SOURCES WERE RETRIEVED.';
        const prompt = `You are Seven AI Research Engine. Write a careful report on: "${topic}".
Use ONLY the evidence below for factual claims. Cite sources inline as [1], [2], etc. Never invent statistics, dates, benchmarks, or citations. If evidence is missing, explicitly say that the point could not be verified. Write in ${isFr ? 'French' : 'English'}.

EVIDENCE:
${evidence}

Output MUST be a JSON object with this exact structure:
{
  "title": "Clear comprehensive report title",
  "summary": "2-3 paragraph executive summary",
  "sections": [
    { "heading": "1. Foundational Architecture & Core Paradigms", "body": "Thorough analytical body paragraphs with technical clarity." },
    { "heading": "2. State of the Art Benchmarks & Empirical Findings", "body": "Analytical breakdown of current capabilities and benchmarks." },
    { "heading": "3. Strategic Implications & Risk Vectors", "body": "Safety, security, regulatory and operational vectors." },
    { "heading": "4. Next-Gen Horizon & Trajectory", "body": "Actionable roadmap and upcoming innovations." }
  ]
}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text() || '';
        const parsed = JSON.parse(text);
        if (parsed.title && parsed.summary && Array.isArray(parsed.sections)) {
          title = parsed.title;
          summary = parsed.summary;
          sections = parsed.sections;
          generatedViaAi = true;
          store.addTerminalLog('AI research extraction completed successfully.', 'success');
        }
      } catch (err) {
        store.addTerminalLog(`Gemini synthesis note: ${err}. Using fallback synthesis matrix.`, 'warn');
      }
    }

    if (!generatedViaAi) {
      if (sources.length) {
        summary = isFr
          ? `Le modèle de synthèse n’était pas disponible. Ce document présente les extraits récupérés sans ajouter d’affirmations non vérifiées.`
          : `The synthesis model was unavailable. This document presents the retrieved extracts without adding unverified claims.`;
        sections = sources.map((source, index) => ({
          heading: `${index + 1}. ${source.title}`,
          body: `${source.snippet || (isFr ? 'Aucun extrait disponible.' : 'No extract available.')} [${index + 1}]`,
        }));
      } else {
        summary = isFr
          ? `Aucune source vérifiable n’a pu être récupérée. Aucun rapport factuel n’a été fabriqué.`
          : `No verifiable source could be retrieved. No factual report was fabricated.`;
        sections = [
          {
            heading: isFr ? 'Recherche indisponible' : 'Research unavailable',
            body: isFr
              ? 'Vérifiez votre connexion puis relancez la recherche. Ce brouillon ne contient aucune affirmation générée.'
              : 'Check your connection and retry. This draft contains no generated factual claims.',
          },
        ];
      }
    }

    // Sanitize everything that came from the model/user before templating.
    const safeTitle = this.escapeHtml(title);
    const safeSummary = this.escapeHtml(summary);
    const safeSections = sections.map((sec) => ({
      heading: this.escapeHtml(sec.heading),
      body: this.escapeHtml(sec.body),
    }));
    const safeSources = sources.map((source) => ({
      title: this.escapeHtml(source.title),
      // Only links returned by the search providers are rendered. Restrict the
      // scheme so a malformed model/search response cannot inject javascript:.
      url: /^https?:\/\//i.test(source.url) ? this.escapeHtml(source.url) : '',
    }));

    store.addTerminalLog('Formatting document to high-resolution print PDF...', 'cmd');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <style>
    @page { margin: 20mm; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1a202c;
      line-height: 1.6;
      background-color: #ffffff;
      padding: 10px;
    }
    .header-bar {
      border-bottom: 3px solid #ffd700;
      padding-bottom: 12px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .logo-text {
      font-size: 14px;
      font-weight: 800;
      color: #b7791f;
      letter-spacing: 2px;
      font-family: monospace;
    }
    .report-date {
      font-size: 11px;
      color: #718096;
      font-family: monospace;
    }
    h1 {
      font-size: 26px;
      color: #1a202c;
      margin-top: 0;
      margin-bottom: 8px;
      line-height: 1.2;
    }
    .badge {
      display: inline-block;
      background: #fefcbf;
      color: #744210;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 16px;
      font-family: monospace;
      border: 1px solid #ecc94b;
    }
    .summary-box {
      background: #f7fafc;
      border-left: 4px solid #3182ce;
      padding: 14px 18px;
      margin-bottom: 24px;
      border-radius: 0 6px 6px 0;
    }
    .summary-title {
      font-size: 12px;
      font-weight: 800;
      color: #2b6cb0;
      letter-spacing: 1px;
      margin-bottom: 6px;
      font-family: monospace;
    }
    .summary-text {
      font-size: 13px;
      color: #2d3748;
      margin: 0;
    }
    .section {
      margin-bottom: 22px;
    }
    /* Pagination: each section starts on a fresh page; content blocks never
       split across a page boundary. expo-print's WebView (Chromium) supports
       these CSS fragmenter hints. */
    .page {
      page-break-after: always;
      break-after: page;
    }
    .page:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }
    .section-block {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    h2 {
      font-size: 16px;
      color: #2d3748;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 8px;
      page-break-after: avoid;
      break-after: avoid;
    }
    /* Clickable table of contents */
    .toc-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 14px 18px;
      margin-bottom: 26px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .toc-title {
      font-size: 12px;
      font-weight: 800;
      color: #2d3748;
      letter-spacing: 1px;
      margin-bottom: 10px;
      font-family: monospace;
    }
    .toc-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .toc-list li {
      margin-bottom: 8px;
    }
    .toc-list a {
      color: #2b6cb0;
      text-decoration: none;
      font-size: 12.5px;
      font-weight: 600;
      border-bottom: 1px dotted #90cdf4;
    }
    .toc-num {
      display: inline-block;
      width: 22px;
      color: #b7791f;
      font-family: monospace;
      font-weight: 700;
    }
    p {
      font-size: 12.5px;
      color: #4a5568;
      margin-bottom: 8px;
      text-align: justify;
    }
    .footer-bar {
      margin-top: 40px;
      border-top: 1px solid #e2e8f0;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #a0aec0;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="logo-text">SEVEN AI // RESEARCH CORE</div>
    <div class="report-date">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  </div>

  <div class="badge">CONFIDENTIAL EXECUTIVE BRIEFING</div>
  <h1>${safeTitle}</h1>

  <div class="summary-box">
    <div class="summary-title">EXECUTIVE SYNTHESIS SUMMARY</div>
    <p class="summary-text">${safeSummary}</p>
  </div>

  <div class="toc-box">
    <div class="toc-title">TABLE OF CONTENTS</div>
    <ul class="toc-list">
      ${safeSections
        .map(
          (sec, i) => `<li>
        <a href="#section-${i + 1}"><span class="toc-num">${String(i + 1).padStart(2, '0')}</span>${sec.heading}</a>
      </li>`
        )
        .join('')}
    </ul>
  </div>

  ${safeSections
    .map(
      (sec, i) => `
    <div class="page">
      <div class="section-block" id="section-${i + 1}">
        <h2>${sec.heading}</h2>
        <p>${sec.body}</p>
      </div>
    </div>
  `
    )
    .join('')}

  <div class="toc-box">
    <div class="toc-title">${isFr ? 'SOURCES VÉRIFIÉES' : 'VERIFIED SOURCES'}</div>
    ${safeSources.length
      ? `<ol>${safeSources.map((source) => `<li><a href="${source.url}">${source.title}</a><br><small>${source.url}</small></li>`).join('')}</ol>`
      : `<p>${isFr ? 'Aucune source récupérée — document non vérifié.' : 'No source retrieved — unverified document.'}</p>`}
  </div>

  <div class="footer-bar">
    <div>Synthesized by Seven AI Autonomous Agent for ${userName}</div>
    <div>Document ID: SVN-RES-${Date.now().toString().slice(-6)}</div>
  </div>
</body>
</html>
`;

    let pdfUri = '';

    await selfHealing.wrapExecution(
      'Print PDF',
      'research_output.pdf',
      htmlContent,
      async () => {
        if (Platform.OS !== 'web') {
          const { uri } = await Print.printToFileAsync({ html: htmlContent });
          pdfUri = uri;

          // Copy to downloads directory if possible
          const docDir = storageService.getDocumentDirectory();
          if (docDir) {
            const safeName = topic.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const target = `${docDir}Downloads/Research_${safeName}.pdf`;
            try {
              await storageService.copy(uri, target);
              pdfUri = target;
            } catch {
              // keep uri
            }
          }
        } else {
          // Web environment data url
          pdfUri = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
        }
      }
    );

    store.addTerminalLog(`* PDF successfully compiled: ${pdfUri}`, 'success');

    const doc: ResearchDocument = {
      id: `res-${Date.now()}`,
      topic,
      title,
      summary,
      sections,
      sources,
      content: htmlContent,
      pdfUri,
      timestamp: Date.now(),
    };

    store.addResearchDoc(doc);
    store.setStatus('idle');
    return doc;
  }

  /**
   * Shares the generated PDF file using native share sheet
   */
  public async sharePdf(uri: string): Promise<void> {
    try {
      if (Platform.OS !== 'web') {
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Share SEVEN Research PDF',
            UTI: 'com.adobe.pdf',
          });
        }
      } else {
        window.open(uri, '_blank');
      }
    } catch (e) {
      console.warn('Share PDF error:', e);
    }
  }
}

export const researchService = ResearchService.getInstance();
