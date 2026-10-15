import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from 'stremio/common';
import { Button } from 'stremio/components';
import useInstalledAddons from '../../Addons/useInstalledAddons';
import { useSettingsPresentation } from '../Presentation';
import { Section } from '../components';
import { configurationUrl, readConfiguration, buildConfigurationUrl } from './configuration';
import styles from './PluginSettings.less';

type Field = { key: string, label: string, level: string, type: string, options?: string[] };
type Configuration = { kind: string, values: Record<string, string | number | boolean>, fields: Field[], origin: string, originalUrl: string };
const Editor = ({ configuration, onClose }: { configuration: Configuration, onClose: () => void }) => {
    const { t } = useTranslation();
    const [level, setLevel] = useState('common');
    const [changes, setChanges] = useState<Record<string, string>>({});
    const [error, setError] = useState(false);
    const [generated, setGenerated] = useState<string | null>(null);
    const { openExternal } = usePlatform();
    const { state } = useSettingsPresentation();
    const setDraftDirty = state?.setDraftDirty;
    const dirty = Object.keys(changes).some((key) => changes[key] !== String(configuration.values[key]));
    useEffect(() => {
        setDraftDirty?.(dirty);
        return () => setDraftDirty?.(false);
    }, [dirty, setDraftDirty]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);
    const close = () => { if (!dirty || window.confirm(t('SETTINGS_PLUGIN_DISCARD'))) onClose(); };
    const generate = () => {
        setError(false);
        try { setGenerated(buildConfigurationUrl(configuration, changes)); } catch { setError(true); }
    };
    const fields = configuration.fields.filter((field) => field.level === level);
    return <div className={styles['editor']}>
        <p>{t('SETTINGS_PLUGIN_DRAFT_HINT')}</p>
        <div role={'group'} aria-label={t('SETTINGS_PLUGIN_OPTIONS')} className={styles['actions']}>
            {['common', 'advanced'].map((item) => <button type={'button'} key={item} aria-pressed={level === item} onClick={() => setLevel(item)}>{t(item === 'common' ? 'SETTINGS_COMMON' : 'SETTINGS_ADVANCED')}</button>)}
        </div>
        {!fields.length && <p>{t('SETTINGS_PLUGIN_NO_FIELDS')}</p>}
        {fields.map((field) => field.type === 'multi' ? <fieldset key={field.key} className={styles['choices']}>
            <legend>{t(field.label)}</legend>
            {Array.from(new Set([...(field.options || []), ...String(configuration.values[field.key]).split(',').filter(Boolean)])).map((token) => {
                const value = changes[field.key] ?? String(configuration.values[field.key]);
                const selected = value.split(',').filter(Boolean);
                return <label key={token}><input type={'checkbox'} checked={selected.includes(token)} onChange={(event) => {
                    const next = event.target.checked ? [...selected, token] : selected.filter((item) => item !== token);
                    setChanges({ ...changes, [field.key]: next.join(',') }); setGenerated(null);
                }} /><span>{t(`SETTINGS_PLUGIN_CHOICE_${token.toUpperCase()}`, { defaultValue: token })}</span></label>;
            })}
        </fieldset> : <label className={styles['field']} key={field.key}>
            <span>{t(field.label)}</span>
            {field.type === 'select' && field.options ? <select value={changes[field.key] ?? String(configuration.values[field.key])} onChange={(event) => { setChanges({ ...changes, [field.key]: event.target.value }); setGenerated(null); }}>
                {field.options.map((value: string) => <option key={value} value={value}>{value === 'true' ? t('SETTINGS_ENABLED') : value === 'false' ? t('SETTINGS_DISABLED') : value}</option>)}
            </select> : <input type={field.type === 'number' ? 'number' : 'text'} min={field.type === 'number' ? 0 : undefined} max={field.type === 'number' ? 10000 : undefined} step={field.type === 'number' ? 1 : undefined} value={changes[field.key] ?? String(configuration.values[field.key])} onChange={(event) => { setChanges({ ...changes, [field.key]: event.target.value }); setGenerated(null); }} />}
        </label>)}
        <p>{t('SETTINGS_PLUGIN_UNKNOWN_PRESERVED')}</p>
        <div className={styles['actions']}><button type={'button'} onClick={generate} disabled={!dirty}>{t('SETTINGS_PLUGIN_PREPARE')}</button><button type={'button'} onClick={close}>{t('BUTTON_CANCEL')}</button></div>
        {error && <p role={'alert'}>{t('SETTINGS_PLUGIN_INVALID')}</p>}
        {generated && <div role={'status'}>
            <p>{t('SETTINGS_PLUGIN_PREPARED')}</p>
            <button type={'button'} onClick={() => { const url = configurationUrl(generated); if (url) openExternal(url); }}>{t('SETTINGS_PLUGIN_CONTINUE_EXTERNAL')}</button>
        </div>}
    </div>;
};
const installedParams = { path: 'addons' };
const PluginSettings = () => {
    const { t } = useTranslation();
    const { openExternal } = usePlatform();
    const installed = useInstalledAddons(installedParams);
    const { state } = useSettingsPresentation();
    const [editing, setEditing] = useState<string | null>(null);
    return <Section label={'SETTINGS_MY_ADDONS'}>
        <p className={styles['hint']}>{t('SETTINGS_PLUGIN_SCOPE')}</p>
        <div className={styles['list']}>
            {installed.catalog.map((addon, index) => {
                const configuration = readConfiguration(addon) as Configuration | null;
                const configurable = addon.manifest.behaviorHints?.configurable || addon.manifest.behaviorHints?.configurationRequired || configuration;
                const external = configurable ? configurationUrl(addon.transportUrl) : null;
                const editingThis = editing === addon.transportUrl;
                return <div className={styles['card']} key={addon.transportUrl}>
                    <div className={styles['heading']}><h3>{addon.manifest.name}</h3><span>{addon.manifest.version}</span></div>
                    <p>{(addon.manifest as AddonManifest & { resources?: (string | { name: string })[] }).resources?.map((resource) => t(`SETTINGS_PLUGIN_RESOURCE_${(typeof resource === 'string' ? resource : resource.name).toUpperCase()}`)).join(' · ') || addon.manifest.types.join(' / ')}</p>
                    <p>{t(configuration ? 'SETTINGS_PLUGIN_NATIVE_AVAILABLE' : addon.manifest.behaviorHints?.configurable || external ? 'SETTINGS_PLUGIN_EXTERNAL' : 'SETTINGS_PLUGIN_NO_CONFIGURATION', { number: index + 1 })}</p>
                    <div className={styles['actions']}>
                        {configuration && !editingThis && <button type={'button'} onClick={() => { if (!state?.draftDirty || window.confirm(t('SETTINGS_PLUGIN_DISCARD'))) { state?.setDraftDirty(false); setEditing(addon.transportUrl); } }}>{t('SETTINGS_PLUGIN_EDIT_DRAFT')}</button>}
                        {external && <button type={'button'} onClick={() => openExternal(external)}>{t('SETTINGS_PLUGIN_OPEN_EXTERNAL')}</button>}
                    </div>
                    {configuration && editingThis && <Editor configuration={configuration} onClose={() => setEditing(null)} />}
                </div>;
            })}
        </div>
        {!installed.catalog.length && <p>{t('NO_ADDONS')}</p>}
        <div className={styles['actions']}><Button href={'#/addons'} target={'_self'}>{t('SETTINGS_PLUGIN_MANAGE')}</Button></div>
    </Section>;
};
export default PluginSettings;
