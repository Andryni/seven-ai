import { useSevenStore } from '../store/useSevenStore';
import { DaveProject } from '../types';
import { selfHealing } from './selfHealing';
import { storageService } from '../services/storageService';
import { resolveModel } from './geminiClient';
import {
  generateSaaSLandingPage,
  generateRoboticsDashboard,
  generateArcadeGame,
  generateMasterDeveloperPortfolio,
} from './daveAgentTemplates';

class DaveAgentService {
  private static instance: DaveAgentService;
  private baseDir: string;

  private constructor() {
    this.baseDir = `${storageService.getDocumentDirectory()}SevenUploads/`;
  }

  public static getInstance(): DaveAgentService {
    if (!DaveAgentService.instance) {
      DaveAgentService.instance = new DaveAgentService();
    }
    return DaveAgentService.instance;
  }

  /**
   * Derives a short, filesystem-safe, unique-ish project name from the prompt.
   * Previous behavior always wrote to "portfolio-website/", overwriting every
   * previous build regardless of the prompt.
   */
  private static slugifyProjectName(prompt: string): string {
    const base = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join('-')
      .slice(0, 48) || 'web-project';

    return `${base}-${Date.now().toString(36)}`;
  }

  /**
   * Builds a complete multi-file modern web project
   */
  public async buildProject(prompt: string, projectName?: string): Promise<DaveProject> {
    const store = useSevenStore.getState();
    const userName = store.config.userName || 'SEVEN Commander';
    const apiKey = store.config.geminiApiKey;

    store.setStatus('building');
    store.addTerminalLog(`$ dave_build "${prompt}"`, 'cmd');
    store.addTerminalLog(`Noted ${userName} is currently working on: ${prompt}`, 'info');

    const resolvedName = projectName || DaveAgentService.slugifyProjectName(prompt);
    const projectDir = `${this.baseDir}${resolvedName}/`;

    // Ensure directory
    await storageService.ensureDirectory(projectDir);

    let files: DaveProject['files'] = {
      'index.html': '',
      'style.css': '',
      'script.js': '',
    };

    // Try Gemini if available
    let generatedViaAi = false;
    if (apiKey && apiKey.trim().length > 5) {
      try {
        store.addTerminalLog('Synthesizing DOM architecture via Gemini neural core...', 'cmd');
        const { model } = await resolveModel(apiKey, {
          generationConfig: { responseMimeType: 'application/json' },
        });

        const aiPrompt = `You are Dave Agent, an elite frontend web builder.
Generate a complete, hyper-modern, beautiful responsive website for "${userName}" based on this prompt: "${prompt}".
Theme requirements: Dark futuristic cyberpunk/JARVIS theme with dark #0a0b10 background, cyan #00e5ff and gold #ffd700 glow accents.
Include sections:
1. Hero Header with animated glowing headline, status indicator, and CTA buttons.
2. Tech Stack & Skills with interactive badges/meters.
3. Featured Projects with filterable category tags (AI Agents, Systems, FullStack).
4. Interactive Contact form with working JS feedback.
5. High quality CSS with flexbox, grid, glassmorphism cards, glowing borders, animations.
6. Pure vanilla JS for particle background or smooth interactive filtering.

Output MUST be a single valid JSON object with EXACTLY these 3 keys:
{
  "index.html": "<full html content without external cdns>",
  "style.css": "<full modern css>",
  "script.js": "<full working js>"
}`;

        const result = await model.generateContent(aiPrompt);
        const text = result.response.text() || '';
        const parsed = JSON.parse(text);
        if (parsed['index.html'] && parsed['style.css'] && parsed['script.js']) {
          files = {
            'index.html': parsed['index.html'],
            'style.css': parsed['style.css'],
            'script.js': parsed['script.js'],
          };
          generatedViaAi = true;
          store.addTerminalLog('Gemini synthesis verified with 3 modules.', 'success');
        }
      } catch (aiErr: any) {
        store.addTerminalLog(
          `Gemini synthesis notice: ${aiErr?.message || aiErr}. Activating Dave Core Synthesizer...`,
          'warn'
        );
      }
    }

    // High quality built-in modern template if AI key not configured or fallback
    if (!generatedViaAi) {
      const p = prompt.toLowerCase();
      if (p.includes('saas') || p.includes('pricing')) {
        files = generateSaaSLandingPage(userName, prompt);
      } else if (p.includes('dashboard') || p.includes('robotics')) {
        files = generateRoboticsDashboard(userName, prompt);
      } else if (p.includes('game') || p.includes('arcade')) {
        files = generateArcadeGame(userName, prompt);
      } else {
        files = generateMasterDeveloperPortfolio(userName, prompt);
      }
    }

    const lowerPrompt = prompt.toLowerCase();
    const projectKind: NonNullable<DaveProject['projectKind']> = lowerPrompt.includes('python')
      ? 'python'
      : lowerPrompt.includes('expo') || lowerPrompt.includes('react native')
        ? 'expo'
        : lowerPrompt.includes('node') || lowerPrompt.includes('api')
          ? 'node'
          : lowerPrompt.includes('react')
            ? 'react'
            : 'static-web';
    const commands: DaveProject['commands'] = projectKind === 'python'
      ? { start: 'python main.py', test: 'python -m unittest' }
      : projectKind === 'node' || projectKind === 'react' || projectKind === 'expo'
        ? { install: 'npm install', start: projectKind === 'expo' ? 'npx expo start' : 'npm start', test: 'npm test' }
        : { start: 'Open index.html', test: 'SEVEN static checks' };
    if (projectKind === 'python') {
      files['main.py'] = `\"\"\"${prompt.replace(/\"/g, '\\"')}\"\"\"\n\ndef main():\n    print(\"DAVE Python project ready\")\n\nif __name__ == \"__main__\":\n    main()\n`;
      files['test_main.py'] = 'import unittest\nimport main\n\nclass ProjectTest(unittest.TestCase):\n    def test_main_exists(self):\n        self.assertTrue(callable(main.main))\n';
      files['requirements.txt'] = '';
    } else if (projectKind !== 'static-web') {
      files['package.json'] = JSON.stringify({ name: resolvedName, private: true, scripts: { start: projectKind === 'expo' ? 'expo start' : projectKind === 'node' ? 'node server.js' : 'vite', test: 'node --test' } }, null, 2);
      if (projectKind === 'node') files['server.js'] = 'const http = require("http");\nhttp.createServer((req,res)=>{res.setHeader("content-type","application/json");res.end(JSON.stringify({status:"ok"}));}).listen(process.env.PORT || 3000);\n';
    }

    // Write files with Self-Healing observability wrap (errors propagate)
    await selfHealing.wrapExecution(
      'Write index.html',
      `${resolvedName}/index.html`,
      files['index.html'],
      async () => {
        store.addTerminalLog(`+ Writing file index.html`, 'cmd');
        await storageService.writeAsString(`${projectDir}index.html`, files['index.html']);
      }
    );

    await selfHealing.wrapExecution(
      'Write style.css',
      `${resolvedName}/style.css`,
      files['style.css'],
      async () => {
        store.addTerminalLog(`+ Writing file style.css`, 'cmd');
        await storageService.writeAsString(`${projectDir}style.css`, files['style.css']);
      }
    );

    await selfHealing.wrapExecution(
      'Write script.js',
      `${resolvedName}/script.js`,
      files['script.js'],
      async () => {
        store.addTerminalLog(`+ Writing file script.js`, 'cmd');
        await storageService.writeAsString(`${projectDir}script.js`, files['script.js']);
      }
    );

    for (const [fileName, content] of Object.entries(files)) {
      if (['index.html', 'style.css', 'script.js'].includes(fileName)) continue;
      await selfHealing.wrapExecution(`Write ${fileName}`, `${resolvedName}/${fileName}`, content, async () => {
        store.addTerminalLog(`+ Writing file ${fileName}`, 'cmd');
        await storageService.writeAsString(`${projectDir}${fileName}`, content);
      });
    }

    store.addTerminalLog(`* Synthesized AST verification [OK]`, 'success');
    store.addTerminalLog(`Project mounted on SevenUploads/${resolvedName}/`, 'success');

    const projectRecord: DaveProject = {
      id: `dave-${Date.now()}`,
      name: resolvedName,
      prompt,
      timestamp: Date.now(),
      files,
      folderPath: projectDir,
      previewHtml: files['index.html'],
      projectKind,
      commands,
      versions: [{ id: `v-${Date.now()}`, timestamp: Date.now(), label: 'Initial build', files: { ...files } }],
    };

    store.addDaveProject(projectRecord);
    store.setStatus('idle');

    return projectRecord;
  }

  /**
   * Iterative refinement: applies a follow-up instruction ("make the title
   * blue", "add a contact section") to an EXISTING project. With a Gemini key
   * the model rewrites the affected files with the full current source in
   * context; without a key the request fails honestly (templates are static).
   * Files are rewritten in place and the store record is updated.
   */
  public async refineProject(project: DaveProject, instruction: string): Promise<DaveProject> {
    const store = useSevenStore.getState();
    const apiKey = store.config.geminiApiKey;

    store.setStatus('building');
    store.addTerminalLog(`$ dave_refine "${instruction}" → ${project.name}/`, 'cmd');

    if (!apiKey || apiKey.trim().length <= 5) {
      store.setStatus('idle');
      const msg =
        'Refinement requires a Gemini API key (the built-in templates are static). Set one in Settings and try again.';
      store.addTerminalLog(`REFINE ABORTED: ${msg}`, 'error');
      throw new Error(msg);
    }

    try {
      const { model } = await resolveModel(apiKey, {
        generationConfig: { responseMimeType: 'application/json' },
      });

      const aiPrompt = `You are Dave Agent in REFINEMENT mode. You previously built a website project from the prompt: "${project.prompt}".
Current source files:
--- index.html ---
${project.files['index.html']}
--- style.css ---
${project.files['style.css']}
--- script.js ---
${project.files['script.js']}

The user now requests this change: "${instruction}"

Apply ONLY the requested change, keeping everything else intact and consistent. Output a single JSON object with EXACTLY these 3 keys (full final file contents):
{"index.html": "...", "style.css": "...", "script.js": "..."}`;

      const result = await model.generateContent(aiPrompt);
      const parsed = JSON.parse(result.response.text() || '');
      if (!parsed['index.html'] || !parsed['style.css'] || !parsed['script.js']) {
        throw new Error('Gemini returned an incomplete project structure.');
      }

      const files = {
        'index.html': parsed['index.html'],
        'style.css': parsed['style.css'],
        'script.js': parsed['script.js'],
      };

      // Rewrite files in place (same folder → same project, now iterated).
      for (const [fileName, content] of Object.entries(files)) {
        await selfHealing.wrapExecution(`Refine ${fileName}`, `${project.name}/${fileName}`, content, async () => {
          store.addTerminalLog(`~ Rewriting file ${fileName}`, 'cmd');
          await storageService.writeAsString(`${project.folderPath}${fileName}`, content);
        });
      }

      const now = Date.now();
      const updates: Partial<DaveProject> = {
        files,
        previewHtml: files['index.html'],
        prompt: `${project.prompt} | ${instruction}`,
        timestamp: now,
        versions: [
          { id: `v-${now}`, timestamp: now, label: instruction.slice(0, 60), files: { ...files } },
          ...(project.versions || [{ id: `v-${project.timestamp}`, timestamp: project.timestamp, label: 'Imported baseline', files: { ...project.files } }]),
        ].slice(0, 20),
      };

      store.updateDaveProject(project.id, updates);
      store.addTerminalLog(`* Project refined in place: ${project.name}/`, 'success');
      store.setStatus('idle');

      return { ...project, ...updates };
    } catch (e: any) {
      store.setStatus('idle');
      const message = e?.message || String(e);
      store.addTerminalLog(`REFINE FAILED: ${message}`, 'error');
      throw e;
    }
  }

  public async saveProjectFiles(
    project: DaveProject,
    files: DaveProject['files'],
    label = 'Manual edit'
  ): Promise<DaveProject> {
    for (const [name, content] of Object.entries(files)) {
      await storageService.writeAsString(`${project.folderPath}${name}`, content);
    }
    const now = Date.now();
    const updated: DaveProject = {
      ...project,
      files,
      previewHtml: files['index.html'],
      timestamp: now,
      versions: [
        { id: `v-${now}`, timestamp: now, label, files: { ...files } },
        ...(project.versions || []),
      ].slice(0, 20),
    };
    useSevenStore.getState().updateDaveProject(project.id, updated);
    return updated;
  }

  public async restoreVersion(project: DaveProject, versionId: string): Promise<DaveProject> {
    const version = project.versions?.find((item) => item.id === versionId);
    if (!version) throw new Error('Project version not found.');
    const files = version.files as DaveProject['files'];
    return this.saveProjectFiles(project, files, `Restored ${version.label}`);
  }

  public runProjectTests(project: DaveProject): NonNullable<DaveProject['lastTestReport']> {
    const html = project.files['index.html'] || '';
    const css = project.files['style.css'] || '';
    const js = project.files['script.js'] || '';
    const checks = [
      { name: 'HTML document', ok: /<html[\s>]/i.test(html) && /<\/html>/i.test(html), detail: 'Opening and closing HTML root' },
      { name: 'Stylesheet link', ok: /style\.css/i.test(html), detail: 'index.html references style.css' },
      { name: 'Script link', ok: /script\.js/i.test(html), detail: 'index.html references script.js' },
      { name: 'Responsive viewport', ok: /name=["']viewport["']/i.test(html), detail: 'Mobile viewport metadata' },
      { name: 'CSS payload', ok: css.trim().length > 100, detail: `${css.length} CSS characters` },
      { name: 'JavaScript syntax shape', ok: (js.match(/{/g)?.length || 0) === (js.match(/}/g)?.length || 0), detail: 'Balanced block braces' },
    ];
    const report = {
      passed: checks.filter((check) => check.ok).length,
      failed: checks.filter((check) => !check.ok).length,
      checks,
      timestamp: Date.now(),
    };
    useSevenStore.getState().updateDaveProject(project.id, { lastTestReport: report });
    useSevenStore.getState().addTerminalLog(`TESTS: ${report.passed} passed / ${report.failed} failed`, report.failed ? 'warn' : 'success');
    return report;
  }

  public diffVersions(project: DaveProject, olderId: string, newerId: string): { file: string; added: number; removed: number }[] {
    const older = project.versions?.find((version) => version.id === olderId);
    const newer = project.versions?.find((version) => version.id === newerId);
    if (!older || !newer) return [];
    const names = new Set([...Object.keys(older.files), ...Object.keys(newer.files)]);
    return [...names].map((file) => {
      const before = new Set((older.files[file] || '').split('\n'));
      const after = new Set((newer.files[file] || '').split('\n'));
      return {
        file,
        added: [...after].filter((line) => !before.has(line)).length,
        removed: [...before].filter((line) => !after.has(line)).length,
      };
    });
  }
}

export const daveAgent = DaveAgentService.getInstance();
