
export const LocalStorage = (key) => {
    const localStorage = window.localStorage;

    const parseJson = (string) => {
        try {
            return JSON.parse(string);
        } catch (e) {
            // TODO: Option?
            return undefined;
        }
    };

    const restore = () => {
        const stringValue = localStorage.getItem(key);
        return parseJson(stringValue);
    };

    const persist = (value) => {
        const jsonValue = JSON.stringify(value);
        localStorage.setItem(key, jsonValue);
    };

    return {
        restore,
        persist
    };
};
