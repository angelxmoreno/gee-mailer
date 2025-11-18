import 'reflect-metadata';
import path from 'node:path';
import { appContainer } from '@app/config.ts';
import { BullMQCodeGen, type BullMQCodeGenOptions } from '@app/modules/bullmq/BullMQGenerator.ts';
import { AppLogger } from '@app/utils/tokens.ts';

const main = async (options: BullMQCodeGenOptions) => {
    const codeGenerator = new BullMQCodeGen(options);
    await codeGenerator.generate();
};

const rootDir = path.resolve('./');
main({
    logger: appContainer.resolve(AppLogger),
    config: `${rootDir}/src/queues/queueDefinitions.ts`, // Path to config file
    outDir: `${rootDir}/src/queues/generated`,
    templatesDir: `${rootDir}/src/modules/bullmq/templates`,
}).catch(console.error);
