declare module 'clean-html' {
  interface CleanOptions {
    'break-around-comments'?: boolean;
    'decode-entities'?: boolean;
    'remove-attributes'?: string[];
    'wrap'?: number;
    'preserve-tags'?: string[];
    'remove-empty-tags'?: boolean;
  }

  function clean(
    html: string,
    options: CleanOptions,
    callback: (cleanedHtml: string) => void
  ): void;
  function clean(
    html: string,
    callback: (cleanedHtml: string) => void
  ): void;

  export = {
    clean
  };
} 