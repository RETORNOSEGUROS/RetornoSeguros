// rbac-helpers.js - Helpers de Controle de Acesso
// Importar em todos os arquivos que precisam de verificação de permissão

/**
 * RBAC - Role Based Access Control
 * Centraliza toda a lógica de permissões do sistema
 */
const RBAC = {
  
  // Perfis normalizados
  PERFIS: {
    ADMIN: 'admin',
    GERENTE_CHEFE: 'gerente chefe',
    RM: 'rm',
    ASSISTENTE: 'assistente'
  },
  
  // Emails de administradores (mover para config/env em produção)
  ADMIN_EMAILS: ['patrick@retornoseguros.com.br'],
  
  /**
   * Normaliza string para comparação de perfis
   */
  normalizar(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[-_]/g, " ");
  },
  
  /**
   * Verifica se é admin
   */
  isAdmin(ctx) {
    return ctx.isAdmin || 
           ctx.perfil === this.PERFIS.ADMIN || 
           this.ADMIN_EMAILS.includes(ctx.email?.toLowerCase());
  },
  
  /**
   * Verifica se é Gerente Chefe
   */
  isGerenteChefe(ctx) {
    return this.normalizar(ctx.perfil) === this.PERFIS.GERENTE_CHEFE;
  },
  
  /**
   * Verifica se é RM
   */
  isRM(ctx) {
    const p = this.normalizar(ctx.perfil);
    return p === this.PERFIS.RM || p === 'rm (gerente de conta)';
  },
  
  /**
   * Verifica se é Assistente
   */
  isAssistente(ctx) {
    return this.normalizar(ctx.perfil) === this.PERFIS.ASSISTENTE;
  },
  
  /**
   * Verifica se o registro pertence à mesma agência do usuário
   */
  sameAgencia(ctx, record) {
    if (!ctx.agenciaId) return true; // Sem agência = sem filtro
    const recordAgencia = record.agenciaId || record._agenciaId;
    return !recordAgencia || recordAgencia === ctx.agenciaId;
  },
  
  /**
   * Verifica se o usuário é dono do registro
   */
  isOwner(ctx, record) {
    const ownerFields = [
      record.rmUid, record.rmId, record.gerenteId,
      record.usuarioId, record.criadoPorUid
    ];
    return ownerFields.some(id => id === ctx.uid);
  },
  
  /**
   * Verifica se o usuário pode VER o registro
   */
  canView(ctx, record) {
    // Admin vê tudo
    if (this.isAdmin(ctx)) return true;
    
    // Gerente Chefe e Assistente veem da mesma agência
    if (this.isGerenteChefe(ctx) || this.isAssistente(ctx)) {
      return this.sameAgencia(ctx, record);
    }
    
    // RM vê apenas seus próprios registros E da mesma agência
    if (this.isRM(ctx)) {
      return this.sameAgencia(ctx, record) && this.isOwner(ctx, record);
    }
    
    return false;
  },
  
  /**
   * Verifica se o usuário pode EDITAR o registro
   */
  canEdit(ctx, record) {
    // Admin pode tudo
    if (this.isAdmin(ctx)) return true;
    
    // Gerente Chefe pode editar da mesma agência
    if (this.isGerenteChefe(ctx)) {
      return this.sameAgencia(ctx, record);
    }
    
    // RM e Assistente só podem editar se forem donos
    if (this.isRM(ctx) || this.isAssistente(ctx)) {
      return this.sameAgencia(ctx, record) && this.isOwner(ctx, record);
    }
    
    return false;
  },
  
  /**
   * Verifica se o usuário pode EXCLUIR o registro
   */
  canDelete(ctx, record) {
    // Admin pode tudo
    if (this.isAdmin(ctx)) return true;
    
    // Gerente Chefe pode excluir da mesma agência
    if (this.isGerenteChefe(ctx)) {
      return this.sameAgencia(ctx, record);
    }
    
    // RM pode excluir apenas seus próprios registros
    if (this.isRM(ctx)) {
      return this.sameAgencia(ctx, record) && this.isOwner(ctx, record);
    }
    
    // Assistente não pode excluir
    return false;
  },
  
  /**
   * Filtra lista de registros baseado nas permissões
   */
  filterRecords(ctx, records) {
    return records.filter(r => this.canView(ctx, r));
  },
  
  /**
   * Filtra lista de usuários/RMs para dropdown
   * - Admin vê todos
   * - Gerente Chefe vê da mesma agência
   * - RM vê apenas ele mesmo
   */
  filterUsers(ctx, users) {
    return Object.entries(users).filter(([id, user]) => {
      if (this.isAdmin(ctx)) return true;
      
      if (this.isGerenteChefe(ctx) || this.isAssistente(ctx)) {
        return user.agenciaId === ctx.agenciaId;
      }
      
      // RM só vê ele mesmo
      return id === ctx.uid;
    });
  },
  
  /**
   * Retorna configuração de query baseada no perfil
   * Para usar com queries do Firestore
   */
  getQueryConfig(ctx, collectionName) {
    const config = {
      needsAgenciaFilter: false,
      needsOwnerFilter: false,
      agenciaId: null,
      ownerUid: null
    };
    
    if (this.isAdmin(ctx)) {
      // Admin não precisa de filtros
      return config;
    }
    
    if (this.isGerenteChefe(ctx) || this.isAssistente(ctx)) {
      // Filtrar por agência
      config.needsAgenciaFilter = true;
      config.agenciaId = ctx.agenciaId;
      return config;
    }
    
    if (this.isRM(ctx)) {
      // Filtrar por agência E por dono
      config.needsAgenciaFilter = true;
      config.needsOwnerFilter = true;
      config.agenciaId = ctx.agenciaId;
      config.ownerUid = ctx.uid;
      return config;
    }
    
    // Perfil desconhecido - negar tudo
    config.needsOwnerFilter = true;
    config.ownerUid = 'BLOCKED';
    return config;
  },
  
  /**
   * Aplica filtros de RBAC a uma query do Firestore
   * Retorna a query modificada
   * 
   * @param {Object} ctx - Contexto do usuário
   * @param {Query} query - Query base do Firestore
   * @param {Object} options - Opções adicionais
   * @returns {Query} - Query com filtros aplicados
   */
  applyQueryFilters(ctx, query, options = {}) {
    const config = this.getQueryConfig(ctx);
    
    if (config.needsAgenciaFilter && config.agenciaId) {
      query = query.where('agenciaId', '==', config.agenciaId);
    }
    
    // Nota: Para filtros de owner, geralmente precisamos fazer no cliente
    // porque o Firestore não suporta OR em múltiplos campos facilmente
    
    return query;
  }
};

// Helpers de UI para loading
const LoadingUI = {
  show(message = 'Carregando...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <p id="loadingMessage">${message}</p>
        </div>
      `;
      document.body.appendChild(overlay);
      
      // Adicionar estilos se não existirem
      if (!document.getElementById('loadingStyles')) {
        const styles = document.createElement('style');
        styles.id = 'loadingStyles';
        styles.textContent = `
          .loading-overlay {
            position: fixed;
            inset: 0;
            background: rgba(255,255,255,0.95);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            flex-direction: column;
          }
          .loading-overlay.active { display: flex; }
          .loading-content { text-align: center; }
          .loading-spinner {
            width: 48px; height: 48px;
            border: 4px solid #e2e8f0;
            border-top-color: #6366f1;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 16px;
          }
          .loading-content p {
            color: #64748b;
            font-size: 14px;
            margin: 0;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(styles);
      }
    }
    
    const msgEl = document.getElementById('loadingMessage');
    if (msgEl) msgEl.textContent = message;
    
    overlay.classList.add('active');
  },
  
  hide() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('active');
  },
  
  updateMessage(message) {
    const msgEl = document.getElementById('loadingMessage');
    if (msgEl) msgEl.textContent = message;
  }
};

// Toast notifications
const Toast = {
  show(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:10px;';
      document.body.appendChild(container);
    }
    
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#6366f1'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
      padding: 12px 20px;
      background: ${colors[type] || colors.info};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease;
      max-width: 350px;
      font-size: 14px;
    `;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg) { this.show(msg, 'info'); }
};

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.RBAC = RBAC;
  window.LoadingUI = LoadingUI;
  window.Toast = Toast;
}

// Para uso como módulo
if (typeof module !== 'undefined') {
  module.exports = { RBAC, LoadingUI, Toast };
}
