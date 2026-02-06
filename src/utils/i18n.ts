/**
 * Internationalization support
 */

import * as vscode from 'vscode';

interface Messages {
    updateTo: string;
    upToDate: string;
    latest: string;
    updateAll: string;
    updated: string;
    packages: string;
    noUpdates: string;
    openRequirements: string;
}

const messages: Record<string, Messages> = {
    'en': {
        updateTo: 'Update to',
        upToDate: 'Up to date',
        latest: 'latest',
        updateAll: 'Update All Packages to Latest Versions',
        updated: 'Updated',
        packages: 'packages to latest versions',
        noUpdates: 'No packages to update',
        openRequirements: 'Please open a requirements.txt or pyproject.toml file'
    },
    'zh-cn': {
        updateTo: '更新到',
        upToDate: '已是最新',
        latest: '最新',
        updateAll: '更新所有包到最新版本',
        updated: '已更新',
        packages: '个包到最新版本',
        noUpdates: '没有需要更新的包',
        openRequirements: '请打开 requirements.txt 或 pyproject.toml 文件'
    },
    'zh-tw': {
        updateTo: '更新到',
        upToDate: '已是最新',
        latest: '最新',
        updateAll: '更新所有套件到最新版本',
        updated: '已更新',
        packages: '個套件到最新版本',
        noUpdates: '沒有需要更新的套件',
        openRequirements: '請開啟 requirements.txt 或 pyproject.toml 檔案'
    },
    'ja': {
        updateTo: 'アップデート',
        upToDate: '最新です',
        latest: '最新',
        updateAll: 'すべてのパッケージを最新版に更新',
        updated: '更新しました',
        packages: 'パッケージを最新版に更新',
        noUpdates: '更新するパッケージはありません',
        openRequirements: 'requirements.txt または pyproject.toml ファイルを開いてください'
    },
    'ko': {
        updateTo: '업데이트',
        upToDate: '최신 버전',
        latest: '최신',
        updateAll: '모든 패키지를 최신 버전으로 업데이트',
        updated: '업데이트됨',
        packages: '패키지를 최신 버전으로 업데이트',
        noUpdates: '업데이트할 패키지가 없습니다',
        openRequirements: 'requirements.txt 또는 pyproject.toml 파일을 열어주세요'
    },
    'fr': {
        updateTo: 'Mettre à jour vers',
        upToDate: 'À jour',
        latest: 'dernière',
        updateAll: 'Mettre à jour tous les paquets vers les dernières versions',
        updated: 'Mis à jour',
        packages: 'paquets vers les dernières versions',
        noUpdates: 'Aucun paquet à mettre à jour',
        openRequirements: 'Veuillez ouvrir un fichier requirements.txt ou pyproject.toml'
    },
    'de': {
        updateTo: 'Aktualisieren auf',
        upToDate: 'Aktuell',
        latest: 'neueste',
        updateAll: 'Alle Pakete auf neueste Versionen aktualisieren',
        updated: 'Aktualisiert',
        packages: 'Pakete auf neueste Versionen',
        noUpdates: 'Keine Pakete zu aktualisieren',
        openRequirements: 'Bitte öffnen Sie eine requirements.txt oder pyproject.toml Datei'
    },
    'es': {
        updateTo: 'Actualizar a',
        upToDate: 'Actualizado',
        latest: 'última',
        updateAll: 'Actualizar todos los paquetes a las últimas versiones',
        updated: 'Actualizado',
        packages: 'paquetes a las últimas versiones',
        noUpdates: 'No hay paquetes para actualizar',
        openRequirements: 'Por favor abra un archivo requirements.txt o pyproject.toml'
    },
    'ru': {
        updateTo: 'Обновить до',
        upToDate: 'Актуально',
        latest: 'последняя',
        updateAll: 'Обновить все пакеты до последних версий',
        updated: 'Обновлено',
        packages: 'пакетов до последних версий',
        noUpdates: 'Нет пакетов для обновления',
        openRequirements: 'Пожалуйста, откройте файл requirements.txt или pyproject.toml'
    }
};

function getLocale(): string {
    const locale = vscode.env.language.toLowerCase();
    
    // Handle specific locales
    if (messages[locale]) {
        return locale;
    }
    
    // Handle language families (e.g., zh-cn, zh-tw)
    const language = locale.split('-')[0];
    if (language === 'zh') {
        return locale.includes('tw') || locale.includes('hk') ? 'zh-tw' : 'zh-cn';
    }
    
    // Fallback to English
    return 'en';
}

export function t(key: keyof Messages): string {
    const locale = getLocale();
    return messages[locale]?.[key] || messages['en'][key];
}