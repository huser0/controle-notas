// Mesma interface de src/storage.js do app web (get/set/delete/list, prefixo
// "controle-notas:"), só que sobre o AsyncStorage. Manter a forma igual faz os
// chamadores portarem sem mudança.

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "controle-notas:";

function fullKey(key) {
  return `${PREFIX}${key}`;
}

const storage = {
  async get(key) {
    try {
      const raw = await AsyncStorage.getItem(fullKey(key));
      if (raw === null) return null;
      return { key, value: raw };
    } catch (e) {
      throw new Error(`Falha ao ler "${key}": ${e.message}`, { cause: e });
    }
  },

  async set(key, value) {
    try {
      await AsyncStorage.setItem(fullKey(key), value);
      return { key, value };
    } catch (e) {
      throw new Error(`Falha ao salvar "${key}": ${e.message}`, { cause: e });
    }
  },

  async delete(key) {
    try {
      await AsyncStorage.removeItem(fullKey(key));
      return { key, deleted: true };
    } catch (e) {
      throw new Error(`Falha ao apagar "${key}": ${e.message}`, { cause: e });
    }
  },

  async list(prefix = "") {
    try {
      const all = await AsyncStorage.getAllKeys();
      const keys = all
        .filter((k) => k.startsWith(PREFIX + prefix))
        .map((k) => k.slice(PREFIX.length));
      return { keys, prefix };
    } catch (e) {
      throw new Error(`Falha ao listar chaves: ${e.message}`, { cause: e });
    }
  },
};

export default storage;
