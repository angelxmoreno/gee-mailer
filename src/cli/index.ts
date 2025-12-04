#!/usr/bin/env bun
import { authCommands } from './commands/auth';

interface Command {
    name: string;
    description: string;
    handler: () => Promise<void>;
}

interface CommandGroup {
    name: string;
    description: string;
    subcommands: Record<string, Command>;
}

const commands: Record<string, CommandGroup> = {
    auth: {
        name: 'auth',
        description: 'OAuth authentication management',
        subcommands: authCommands,
    },
};

function printUsage() {
    console.log('Usage: bun cli <command> <subcommand>');
    console.log('');
    console.log('Available commands:');

    for (const [commandName, command] of Object.entries(commands)) {
        console.log(`  ${commandName} - ${command.description}`);

        for (const [subcommandName, subcommand] of Object.entries(command.subcommands)) {
            console.log(`    ${subcommandName} - ${subcommand.description}`);
        }
        console.log('');
    }
}

function printCommandUsage(commandName: string) {
    const command = commands[commandName];
    if (!command) {
        console.error(`❌ Unknown command: ${commandName}`);
        printUsage();
        return;
    }

    console.log(`Usage: bun cli ${commandName} <subcommand>`);
    console.log('');
    console.log(`${command.description}`);
    console.log('');
    console.log('Available subcommands:');

    for (const [subcommandName, subcommand] of Object.entries(command.subcommands)) {
        console.log(`  ${subcommandName} - ${subcommand.description}`);
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        printUsage();
        return;
    }

    const [commandName, subcommandName] = args;

    // Handle help flags
    if (commandName === '--help' || commandName === '-h') {
        printUsage();
        return;
    }

    if (!commandName) {
        printUsage();
        process.exit(1);
    }

    const command = commands[commandName];
    if (!command) {
        console.error(`❌ Unknown command: ${commandName}`);
        console.log('');
        printUsage();
        process.exit(1);
    }

    if (!subcommandName) {
        printCommandUsage(commandName);
        process.exit(1);
    }

    // Handle help flags for subcommands
    if (subcommandName === '--help' || subcommandName === '-h') {
        printCommandUsage(commandName);
        return;
    }

    const subcommand = command.subcommands[subcommandName];
    if (!subcommand) {
        console.error(`❌ Unknown subcommand: ${commandName} ${subcommandName}`);
        console.log('');
        printCommandUsage(commandName);
        process.exit(1);
    }

    try {
        await subcommand.handler();
        process.exit(0);
    } catch (error) {
        console.error('❌ Command failed:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Only run main if this file is executed directly
if (import.meta.main) {
    void main();
}
