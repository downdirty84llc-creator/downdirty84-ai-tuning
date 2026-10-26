export function mountTroubleshooting(root: HTMLElement, options: {save: (value: unknown, filename: string) => Promise<{status: string}>; externalLinks?: boolean}): () => void;
