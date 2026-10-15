import React, { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { SETTINGS_CATALOG, matchesSetting } from './catalog';

export type SettingsLevel = 'common' | 'advanced' | 'account' | 'about' | 'shortcuts';
type Presentation = { level: SettingsLevel, query: string, unavailable: Set<string>, draftDirty: boolean, setDraftDirty: (dirty: boolean) => void };
export const SettingsPresentation = createContext<Presentation | null>(null);
export const useSettingsPresentation = () => {
    const state = useContext(SettingsPresentation);
    const { t } = useTranslation();
    const visible = (id: string) => {
        if (!state) return true;
        const entry = SETTINGS_CATALOG.find((item) => item.id === id);
        return Boolean(entry && !state.unavailable.has(id) && matchesSetting(entry, state.level, state.query, (key: string) => t(key)));
    };
    const groupVisible = (group: string) => SETTINGS_CATALOG.some((entry) =>
        (entry.group === group || entry.section === group) && visible(entry.id));
    return { visible, groupVisible, state };
};
export const Setting = ({ id, children }: { id: string, children: React.ReactNode }) => {
    const { visible } = useSettingsPresentation();
    return visible(id) ? <>{children}</> : null;
};
