import { AutoConfig, AutoModel, AutoTokenizer, env } from '@huggingface/transformers';
import { normalizedVector } from '../site/semantic.mjs';
import { verifyModel } from './search-download.mjs';

export async function loadEncoder(config, { localPath, progress } = {}) {
  if (localPath) await verifyModel(localPath);
  env.cacheDir = new URL('../.cache/search-model/', import.meta.url).pathname;
  const path = localPath ?? config.model;
  const options = localPath ? {} : { revision: config.revision };
  const modelConfig = await AutoConfig.from_pretrained(path, options);
  modelConfig.vision_config = modelConfig.audio_config = null;
  const model = await AutoModel.from_pretrained(path, {
    ...options, config: modelConfig, device: 'cpu', dtype: config.precision, progress_callback: progress,
  });
  const tokenizer = await AutoTokenizer.from_pretrained(path, options);
  return {
    async encode(text) {
      const output = await model(await tokenizer(text, { truncation: true, max_length: config.max_tokens }));
      return normalizedVector(output.sentence_embedding.data, config.dimensions);
    },
    dispose: () => model.dispose(),
  };
}
