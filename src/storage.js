// Camada de armazenamento local, com a mesma "forma" da API window.storage
// usada nos artifacts do Claude (get/set/delete), mas persistindo no
// localStorage do navegador. Assim o restante do app não precisa mudar.

const PREFIX = "controle-notas:";

function fullKey(key) {
  return `${PREFIX}${key}`;
}

const storage = {
  async get(key) {
    try {
      const raw = window.localStorage.getItem(fullKey(key));
      if (raw === null) return null;
      return { key, value: raw };
    } catch (e) {
      throw new Error(`Falha ao ler "${key}": ${e.message}`);
    }
  },

  async set(key, value) {
    try {
      window.localStorage.setItem(fullKey(key), value);
      return { key, value };
    } catch (e) {
      // Costuma acontecer se o localStorage estiver cheio (quota excedida)
      throw new Error(`Falha ao salvar "${key}": ${e.message}`);
    }
  },

  async delete(key) {
    try {
      window.localStorage.removeItem(fullKey(key));
      return { key, deleted: true };
    } catch (e) {
      throw new Error(`Falha ao apagar "${key}": ${e.message}`);
    }
  },

  async list(prefix = "") {
    try {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(PREFIX + prefix)) {
          keys.push(k.slice(PREFIX.length));
        }
      }
      return { keys, prefix };
    } catch (e) {
      throw new Error(`Falha ao listar chaves: ${e.message}`);
    }
  },
};

// Disponibiliza como window.storage para o App.jsx funcionar sem alterações
if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;