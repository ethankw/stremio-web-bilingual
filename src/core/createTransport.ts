import Bridge from '@stremio/stremio-core-web/bridge';
import { createSettingsPersistence } from './settingsPersistence';

const worker = new Worker(`${process.env.COMMIT_HASH}/scripts/worker.js`);
const bridge = new Bridge(window, worker);

const createTransport = (): CoreTransport => {
    const init = async (args: object): Promise<void> => {
        await bridge.call(['init'], [args]);
        await preferences.restore().catch(() => console.warn('Could not restore browser settings; using the Core profile.'));
    };

    const getState = (model: string): Promise<object> => {
        return bridge.call(['getState'], [model]);
    };

    const rawDispatch = (action: DispatchAction, model?: string): Promise<void> => bridge.call(['dispatch'], [action, model, location.hash]);
    const preferences = createSettingsPersistence({
        storage: () => window.localStorage,
        getState,
        dispatch: rawDispatch,
    });
    const dispatch = async (action: DispatchAction, model?: string): Promise<void> => {
        await rawDispatch(action, model);
        if (action.action === 'Ctx' && action.args?.action === 'UpdateSettings') await preferences.save();
    };

    const encodeStream = (stream: Stream): Promise<string> => {
        return bridge.call(['encodeStream'], [stream]);
    };

    const decodeStream = (stream: string): Promise<Stream> => {
        return bridge.call(['decodeStream'], [stream]);
    };

    const analytics = (event: object): Promise<void> => {
        return bridge.call(['analytics'], [event, location.hash]);
    };

    return {
        init,
        getState,
        dispatch,
        encodeStream,
        decodeStream,
        analytics,
    };
};

export default createTransport;
