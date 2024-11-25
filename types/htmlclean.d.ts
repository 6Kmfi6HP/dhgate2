declare module "htmlclean" {
  function htmlclean(
    html: string,
    options?: {
      protect?: RegExp;
      unprotect?: RegExp;
      edit?: (html: string) => string;
    }
  ): string;
  export = htmlclean;
}
