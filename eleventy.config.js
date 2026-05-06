export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/site/assets": "assets" });

  return {
    dir: {
      input: "src/site",
      includes: "_includes",
      output: "dist"
    },
    htmlTemplateEngine: "liquid",
    markdownTemplateEngine: "liquid",
    templateFormats: ["html", "liquid", "md"]
  };
}