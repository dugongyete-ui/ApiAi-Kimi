import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE = path.join(process.cwd(), 'agent-workspace');
const STATE_FILE = path.join(WORKSPACE, '.agent_state.json');

function ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
}

function loadState(): any {
    ensureWorkspace();
    if (!fs.existsSync(STATE_FILE)) return {};
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function saveState(state: any) {
    ensureWorkspace();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export interface AgentIntelResult {
    success: boolean;
    data?: any;
    message?: string;
    error?: string;
}

// ─── Planner Phase ────────────────────────────────────────────────────────────
// Creates a structured plan with steps for the current task

export function plannerPhase(
    goal: string,
    steps: string[],
    sessionId = 'default'
): AgentIntelResult {
    const state = loadState();
    const plan = {
        id: `plan_${Date.now()}`,
        session_id: sessionId,
        goal,
        steps: steps.map((s, i) => ({
            index: i + 1,
            description: s,
            status: 'pending' as 'pending' | 'in_progress' | 'done' | 'failed',
        })),
        created_at: new Date().toISOString(),
        total_steps: steps.length,
        completed_steps: 0,
    };
    state.plan = plan;
    saveState(state);
    return {
        success: true,
        data: plan,
        message: `Plan created: ${steps.length} steps for goal: "${goal}"`,
    };
}

// ─── Step Tracker ─────────────────────────────────────────────────────────────
// Track progress of plan steps

export function stepTracker(
    action: 'start' | 'complete' | 'fail' | 'status',
    stepIndex?: number,
    note = ''
): AgentIntelResult {
    const state = loadState();
    if (!state.plan) {
        if (action === 'status') {
            return { success: true, data: { status: 'No active plan. Use planner_phase first.' } };
        }
        return { success: false, error: 'No active plan. Create one with planner_phase first.' };
    }

    const plan = state.plan;

    if (action === 'status') {
        const done = plan.steps.filter((s: any) => s.status === 'done').length;
        const failed = plan.steps.filter((s: any) => s.status === 'failed').length;
        const inProgress = plan.steps.filter((s: any) => s.status === 'in_progress').length;
        const pending = plan.steps.filter((s: any) => s.status === 'pending').length;
        return {
            success: true,
            data: {
                goal: plan.goal,
                total: plan.total_steps,
                done, failed, in_progress: inProgress, pending,
                progress_pct: Math.round((done / plan.total_steps) * 100),
                steps: plan.steps,
                current_step: plan.steps.find((s: any) => s.status === 'in_progress'),
                next_step: plan.steps.find((s: any) => s.status === 'pending'),
            },
        };
    }

    if (stepIndex === undefined) {
        return { success: false, error: 'step_index required for start/complete/fail actions' };
    }

    const step = plan.steps.find((s: any) => s.index === stepIndex);
    if (!step) {
        return { success: false, error: `Step ${stepIndex} not found. Valid range: 1-${plan.total_steps}` };
    }

    const prevStatus = step.status;
    if (action === 'start') step.status = 'in_progress';
    else if (action === 'complete') { step.status = 'done'; plan.completed_steps++; }
    else if (action === 'fail') step.status = 'failed';

    if (note) step.note = note;
    step.updated_at = new Date().toISOString();

    saveState(state);
    return {
        success: true,
        data: step,
        message: `Step ${stepIndex} "${step.description}": ${prevStatus} → ${step.status}${note ? ` (${note})` : ''}`,
    };
}

// ─── Loop Supervisor ──────────────────────────────────────────────────────────
// Track iteration budget and detect infinite loops

export function loopSupervisor(
    action: 'init' | 'tick' | 'reset' | 'status',
    maxIterations = 30,
    note = ''
): AgentIntelResult {
    const state = loadState();
    if (!state.loop_state) {
        state.loop_state = { iteration: 0, max: maxIterations, history: [], started_at: new Date().toISOString() };
    }
    const loop = state.loop_state;

    switch (action) {
        case 'init':
            state.loop_state = { iteration: 0, max: maxIterations, history: [], started_at: new Date().toISOString() };
            saveState(state);
            return { success: true, data: state.loop_state, message: `Loop supervisor initialized: max ${maxIterations} iterations` };

        case 'tick':
            loop.iteration++;
            loop.history.push({ iteration: loop.iteration, time: new Date().toISOString(), note });
            if (loop.history.length > 50) loop.history = loop.history.slice(-50);
            saveState(state);
            const remaining = loop.max - loop.iteration;
            const warn = remaining <= 5;
            return {
                success: loop.iteration <= loop.max,
                data: { iteration: loop.iteration, max: loop.max, remaining, warning: warn },
                message: loop.iteration > loop.max
                    ? `MAX ITERATIONS REACHED (${loop.max}). Stop and summarize.`
                    : warn
                    ? `Warning: only ${remaining} iterations remaining`
                    : `Iteration ${loop.iteration}/${loop.max}`,
                error: loop.iteration > loop.max ? 'Loop limit exceeded' : undefined,
            };

        case 'reset':
            state.loop_state = { iteration: 0, max: loop.max, history: [], started_at: new Date().toISOString() };
            saveState(state);
            return { success: true, message: 'Loop counter reset' };

        case 'status':
        default:
            return {
                success: true,
                data: { iteration: loop.iteration, max: loop.max, remaining: loop.max - loop.iteration },
            };
    }
}

// ─── Tool Validator ───────────────────────────────────────────────────────────
// Validate tool call arguments before execution

export function toolValidator(
    toolName: string,
    args: Record<string, any>
): AgentIntelResult {
    const REQUIRED: Record<string, string[]> = {
        shell: ['command'],
        web_search: ['query'],
        web_open_url: ['url'],
        http_request: ['url'],
        browser: ['url'],
        file_read: ['path'],
        file_write: ['path', 'content'],
        file_append: ['path', 'content'],
        file_delete: ['path'],
        create_directory: ['path'],
        move_file: ['src', 'dest'],
        copy_file: ['src', 'dest'],
        code_execute: ['language', 'code'],
        install_package: ['package_name'],
        apply_patch: ['patch'],
        search_in_files: ['query'],
        get_data_source: ['source', 'query'],
        search_image_by_text: ['query'],
        memory_space_edits: ['action'],
        generate_json: ['data'],
        generate_csv: ['data'],
        generate_html: ['content'],
        generate_markdown: ['content'],
        generate_pdf: ['content'],
        planner_phase: ['goal', 'steps'],
        step_tracker: ['action'],
    };

    const required = REQUIRED[toolName] || [];
    const missing = required.filter(k => args[k] === undefined || args[k] === null || args[k] === '');

    if (missing.length > 0) {
        return {
            success: false,
            error: `Tool "${toolName}" missing required arguments: ${missing.join(', ')}`,
            data: { tool: toolName, missing, provided: Object.keys(args) },
        };
    }

    return {
        success: true,
        message: `Tool "${toolName}" arguments valid`,
        data: { tool: toolName, args_provided: Object.keys(args) },
    };
}

// ─── Reflection Pass ──────────────────────────────────────────────────────────
// Reflect on completed work and generate a summary

export function reflectionPass(
    completedSteps: string[],
    goal: string,
    outcome: 'success' | 'partial' | 'failed',
    notes = ''
): AgentIntelResult {
    const state = loadState();
    const reflection = {
        id: `reflection_${Date.now()}`,
        goal,
        outcome,
        completed_steps: completedSteps,
        notes,
        lessons: [] as string[],
        created_at: new Date().toISOString(),
        plan_summary: state.plan ? {
            total: state.plan.total_steps,
            completed: state.plan.steps?.filter((s: any) => s.status === 'done').length || 0,
            failed: state.plan.steps?.filter((s: any) => s.status === 'failed').length || 0,
        } : null,
    };

    // Auto-generate lessons based on outcome
    if (outcome === 'success') {
        reflection.lessons.push('Task completed successfully. Record what approach worked.');
    } else if (outcome === 'partial') {
        reflection.lessons.push('Partial completion. Identify what blocked full completion.');
        if (reflection.plan_summary?.failed > 0) {
            reflection.lessons.push(`${reflection.plan_summary.failed} steps failed. Review and retry those specifically.`);
        }
    } else {
        reflection.lessons.push('Task failed. Analyze root cause before retrying.');
    }

    state.last_reflection = reflection;
    saveState(state);

    const summary = [
        `# Reflection: ${goal}`,
        `Outcome: ${outcome.toUpperCase()}`,
        `Steps completed: ${completedSteps.length}`,
        completedSteps.map((s, i) => `  ${i + 1}. ${s}`).join('\n'),
        notes ? `Notes: ${notes}` : '',
        `Lessons: ${reflection.lessons.join('; ')}`,
    ].filter(Boolean).join('\n');

    return {
        success: true,
        data: { reflection, summary },
        message: summary,
    };
}

// ─── Memory store / retrieve (shortcuts for memory_space_edits) ──────────────

export function memoryStore(content: string, tag = ''): AgentIntelResult {
    const { memorySpaceEdits } = require('./memory.ts');
    const fullContent = tag ? `[${tag}] ${content}` : content;
    const r = memorySpaceEdits('add', { content: fullContent });
    return { success: r.success, data: r.entry, message: r.message, error: r.error };
}

export function memoryRetrieve(filter = ''): AgentIntelResult {
    const { memorySpaceEdits } = require('./memory.ts');
    const r = memorySpaceEdits('list', {});
    if (!r.success) return { success: false, error: r.error };
    let entries = r.entries || [];
    if (filter) {
        entries = entries.filter((e: any) =>
            e.content.toLowerCase().includes(filter.toLowerCase())
        );
    }
    return {
        success: true,
        data: entries,
        message: `${entries.length} memory entries${filter ? ` matching "${filter}"` : ''}`,
    };
}
