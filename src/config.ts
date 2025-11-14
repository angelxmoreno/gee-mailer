import { createConfig } from '@app/utils/createConfig';
import { createContainer } from '@app/utils/createContainer';

const appConfig = createConfig();
const appContainer = createContainer(appConfig);

export { appConfig, appContainer };
