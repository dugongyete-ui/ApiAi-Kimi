import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const SHELL_TIMEOUT = 30000;
const MAX_OUTPUT = 8000;

export interface ShellResult {
    stdout: string;
    stderr: string;
    exit_code: number;
    error?: string;
    timed_out?: boolean;
}

export async function executeShell(command: string, timeout = SHELL_TIMEOUT): Promise<ShellResult> {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const proc = spawn('bash', ['-c', command], {
            timeout,
            env: { ...process.env, TERM: 'xterm' },
        });

        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGTERM');
        }, timeout);

        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({
                stdout: stdout.slice(0, MAX_OUTPUT),
                stderr: stderr.slice(0, MAX_OUTPUT),
                exit_code: code ?? -1,
                timed_out: timedOut,
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                stdout: stdout.slice(0, MAX_OUTPUT),
                stderr: stderr.slice(0, MAX_OUTPUT),
                exit_code: -1,
                error: err.message,
            });
        });
    });
}
