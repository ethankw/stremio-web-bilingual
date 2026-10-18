declare function useSavedBoolean(key: string, defaultValue?: boolean): [boolean, (next: boolean | ((value: boolean) => boolean)) => void];
export = useSavedBoolean;
