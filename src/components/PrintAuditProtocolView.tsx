import React, { forwardRef } from "react";
import { AuditLogEntry } from "../lib/auditLogger";

export interface PrintAuditProtocolProps {
  logs: AuditLogEntry[];
  startDate?: string;
  endDate?: string;
  facilitatorFilter?: string;
  regionFilter?: string;
  districtFilter?: string;
  actionFilter?: string;
  auditorName?: string;
  protocolNumber?: string;
  onClose?: () => void;
}

export const PrintAuditProtocolView = forwardRef<HTMLDivElement, PrintAuditProtocolProps>(
  (
    {
      logs,
      startDate,
      endDate,
      facilitatorFilter,
      regionFilter,
      districtFilter,
      actionFilter,
      auditorName = "Аудитор группы внутреннего контроля",
      protocolNumber,
      onClose,
    },
    ref
  ) => {
    const protoNum =
      protocolNumber ||
      `АП-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowFormatted = new Date().toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Summary calculations
    const totalActions = logs.length;
    const quotesCreated = logs.filter((l) => l.actionType === "CREATE_QUOTE");
    const totalAmountSum = quotesCreated.reduce((sum, l) => sum + (l.totalAmount || 0), 0);
    const printsCount = logs.filter((l) => l.actionType === "PRINT_CART" || l.actionType === "PRINT_CATALOG").length;
    const uniqueBeneficiaries = new Set(logs.map((l) => l.beneficiaryName).filter(Boolean)).size;
    const editsCount = logs.filter((l) => l.actionType === "EDIT_QUOTE" || l.actionType === "DELETE_QUOTE").length;

    const getActionTitleRu = (type: string) => {
      switch (type) {
        case "CREATE_QUOTE":
          return "Оформление спецификации";
        case "EDIT_QUOTE":
          return "Корректировка спецификации";
        case "DELETE_QUOTE":
          return "Удаление спецификации";
        case "PRINT_CART":
          return "Печать Акта / Спецификации";
        case "PRINT_CATALOG":
          return "Печать Каталога цен";
        case "ADMIN_LOGIN":
          return "Вход Администратора";
        case "ADMIN_LOGOUT":
          return "Выход Администратора";
        case "FACILITATOR_LOGIN":
          return "Вход Фасилитатора";
        case "FACILITATOR_LOGOUT":
          return "Выход Фасилитатора";
        case "USER_LOGIN":
          return "Авторизация пользователя";
        case "FACILITATOR_SWITCH":
          return "Смена профиля фасилитатора";
        case "SUPPLIER_LOGIN":
          return "Вход Поставщика в портал";
        case "SUPPLIER_LOGOUT":
          return "Выход Поставщика из портала";
        case "SUPPLIER_UPDATE_PRICE":
          return "Изменение цены товара (Поставщик)";
        case "SUPPLIER_BATCH_PRICE_UPDATE":
          return "Пакетное обновление цен (Поставщик)";
        case "SUPPLIER_ADD_PRODUCT":
          return "Добавление товара (Поставщик)";
        case "SUPPLIER_EDIT_PRODUCT":
          return "Редактирование карточки товара (Поставщик)";
        case "SUPPLIER_DELETE_PRODUCT":
          return "УДАЛЕНИЕ ТОВАРА ИЗ КАТАЛОГА (Поставщик)";
        case "SUPPLIER_IMPORT_EXCEL":
          return "Импорт прайс-листа Excel (Поставщик)";
        case "SUPPLIER_EXPORT_EXCEL":
          return "Выгрузка реестра в Excel (Поставщик)";
        case "SUPPLIER_CLEAR_PRICES":
          return "Обнуление цен в каталоге";
        case "UPDATE_PRICE_EXCEL":
          return "Обновление прайсов поставщика";
        case "EXPORT_EXCEL":
          return "Выгрузка реестра в Excel";
        case "UPDATE_DICTIONARY":
          return "Изменение системных справочников";
        default:
          return type;
      }
    };

    return (
      <div className="fixed inset-0 z-[9999] bg-white overflow-y-auto text-black print:p-0 print:m-0 font-serif">
        {/* Screen Controls (Hidden when printing) */}
        <div className="print:hidden sticky top-0 bg-slate-900 text-white p-4 shadow-xl flex items-center justify-between border-b border-slate-700 z-50">
          <div className="flex items-center gap-3">
            <span className="bg-indigo-600 text-xs px-2.5 py-1 rounded font-mono font-bold tracking-wider">
              {protoNum}
            </span>
            <span className="text-sm font-sans font-medium">
              Предпросмотр официального протокола ревизии ({logs.length} записей)
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-sans font-bold text-sm shadow flex items-center gap-2 cursor-pointer transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Распечатать Протокол
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-sans text-sm transition-colors cursor-pointer"
              >
                Закрыть
              </button>
            )}
          </div>
        </div>

        {/* Printable Document A4 Container */}
        <div ref={ref} className="max-w-[210mm] mx-auto p-8 sm:p-12 print:p-4 bg-white text-slate-900 text-[11pt] leading-normal">
          {/* Header */}
          <div className="text-center border-b-2 border-slate-900 pb-4 mb-5">
            <div className="text-[10pt] uppercase tracking-wider text-slate-700 font-bold mb-1">
              Вазорати меҳнат, муҳоҷират ва шуғли аҳолии Ҷумҳурии Тоҷикистон
            </div>
            <div className="text-[11pt] uppercase tracking-wider font-extrabold text-slate-900 mb-1">
              Министерство труда, миграции и занятости населения Республики Таджикистан
            </div>
            <div className="text-[9.5pt] font-sans font-bold text-indigo-900 uppercase tracking-wide">
              ПРОЕКТ МОДЕРНИЗАЦИИ СОЦИАЛЬНОЙ ЗАЩИТЫ И ЭКОНОМИЧЕСКОЙ ИНТЕГРАЦИИ (SPMEI)
            </div>
            <div className="text-[8.5pt] text-slate-500 font-sans italic mt-1">
              Система централизованного мониторинга, аудита и контроля целевого распределения
            </div>
          </div>

          {/* Title & Document Number */}
          <div className="text-center my-6">
            <h1 className="text-xl font-bold uppercase tracking-wider underline underline-offset-4 mb-2">
              ПРОТОКОЛ АУДИТОРСКОЙ ПРОВЕРКИ И РАССЛЕДОВАНИЯ
            </h1>
            <div className="font-mono text-sm font-bold text-slate-800">
              Регистрационный № {protoNum}
            </div>
            <div className="text-xs text-slate-600 mt-1 font-sans">
              г. Душанбе • Дата формирования протокола: {nowFormatted}
            </div>
          </div>

          {/* Parameters Table */}
          <div className="mb-6 border border-slate-400 rounded p-3 bg-slate-50/50 text-[10pt] font-sans">
            <div className="font-bold uppercase tracking-wider text-[9pt] text-slate-700 border-b border-slate-300 pb-1 mb-2">
              Основание и параметры аудиторской выборки:
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div>
                <span className="text-slate-600">Проверяемый период:</span>{" "}
                <strong className="text-slate-900">
                  {startDate || "Начало работы"} — {endDate || "Текущий момент"}
                </strong>
              </div>
              <div>
                <span className="text-slate-600">Проверяющий специалист/аудитор:</span>{" "}
                <strong className="text-slate-900">{auditorName}</strong>
              </div>
              <div>
                <span className="text-slate-600">Проверяемый фасилитатор:</span>{" "}
                <strong className="text-slate-900">{facilitatorFilter || "Все фасилитаторы проекта"}</strong>
              </div>
              <div>
                <span className="text-slate-600">Географический охват:</span>{" "}
                <strong className="text-slate-900">
                  {regionFilter || "Все регионы"} {districtFilter ? `• район ${districtFilter}` : ""}
                </strong>
              </div>
              <div>
                <span className="text-slate-600">Фильтр операций:</span>{" "}
                <strong className="text-slate-900">{actionFilter ? getActionTitleRu(actionFilter) : "Все типы операций"}</strong>
              </div>
              <div>
                <span className="text-slate-600">Режим выборки:</span>{" "}
                <strong className="text-slate-900">Сплошной перекрестный аудит сессий</strong>
              </div>
            </div>
          </div>

          {/* Executive Summary Cards */}
          <div className="mb-6 grid grid-cols-4 gap-3 text-center font-sans text-xs">
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50">
              <div className="text-[10px] uppercase text-slate-500 font-bold">Всего действий</div>
              <div className="text-lg font-black text-slate-900 mt-0.5">{totalActions}</div>
            </div>
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50">
              <div className="text-[10px] uppercase text-slate-500 font-bold">Спецификаций КП</div>
              <div className="text-lg font-black text-emerald-800 mt-0.5">
                {quotesCreated.length} <span className="text-xs font-normal">({uniqueBeneficiaries} чел.)</span>
              </div>
            </div>
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50">
              <div className="text-[10px] uppercase text-slate-500 font-bold">Сумма распределения</div>
              <div className="text-lg font-black text-indigo-900 mt-0.5">
                {totalAmountSum.toLocaleString("ru-RU")} <span className="text-xs font-normal">с.</span>
              </div>
            </div>
            <div className="border border-slate-300 p-2.5 rounded bg-slate-50">
              <div className="text-[10px] uppercase text-slate-500 font-bold">Фактов печати</div>
              <div className="text-lg font-black text-blue-900 mt-0.5">{printsCount}</div>
            </div>
          </div>

          {/* Detail Audit Table */}
          <div className="mb-8">
            <div className="font-bold text-xs uppercase tracking-wider text-slate-800 mb-2 font-sans flex items-center justify-between">
              <span>Детализированный реестр зарегистрированных действий ({logs.length}):</span>
              <span className="text-[10px] text-slate-500 normal-case">Время: местное (TJT)</span>
            </div>
            <table className="w-full border-collapse border border-slate-400 text-[8.5pt] font-sans">
              <thead>
                <tr className="bg-slate-100 text-slate-800 border-b border-slate-400 text-left">
                  <th className="border border-slate-300 p-1.5 text-center w-8">№</th>
                  <th className="border border-slate-300 p-1.5 w-24">Дата/Время</th>
                  <th className="border border-slate-300 p-1.5 w-32">Фасилитатор / Район</th>
                  <th className="border border-slate-300 p-1.5 w-28">Операция</th>
                  <th className="border border-slate-300 p-1.5 w-36">Бенефициар / КП</th>
                  <th className="border border-slate-300 p-1.5">Содержание действия</th>
                  <th className="border border-slate-300 p-1.5 text-right w-20">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border border-slate-300 p-6 text-center text-slate-500 italic">
                      За выбранный период по указанным фильтрам действий не зафиксировано
                    </td>
                  </tr>
                ) : (
                  logs.map((log, idx) => (
                    <tr
                      key={log.id}
                      className={idx % 2 === 1 ? "bg-slate-50/60" : "bg-white"}
                    >
                      <td className="border border-slate-300 p-1.5 text-center font-mono text-slate-600">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-300 p-1.5 font-mono text-[8pt] text-slate-800 whitespace-nowrap">
                        {log.dateFormatted}
                      </td>
                      <td className="border border-slate-300 p-1.5 leading-tight">
                        <div className="font-bold text-slate-900 truncate max-w-[120px]">
                          {log.facilitatorName || log.actorName}
                        </div>
                        <div className="text-[7.5pt] text-slate-500">
                          {log.district ? `${log.district}` : log.region || "—"}
                        </div>
                      </td>
                      <td className="border border-slate-300 p-1.5 leading-tight">
                        <span className="font-semibold text-slate-800">
                          {getActionTitleRu(log.actionType)}
                        </span>
                      </td>
                      <td className="border border-slate-300 p-1.5 leading-tight">
                        <div className="font-bold text-slate-900">
                          {log.beneficiaryName || "—"}
                        </div>
                        {log.quoteId && (
                          <div className="text-[7.5pt] font-mono text-indigo-700">
                            № {log.quoteId}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-300 p-1.5 leading-snug text-slate-700">
                        {log.details}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono font-bold whitespace-nowrap text-slate-900">
                        {log.totalAmount !== undefined && log.totalAmount > 0
                          ? `${log.totalAmount.toLocaleString("ru-RU")} с.`
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Audit Conclusion Section */}
          <div className="mb-8 border border-slate-300 rounded p-4 font-sans text-xs bg-slate-50/40">
            <div className="font-bold uppercase tracking-wider text-slate-800 mb-2">
              Заключение и примечания ревизионной комиссии:
            </div>
            <div className="text-slate-700 leading-relaxed mb-4">
              Настоящий протокол сформирован автоматически защищенным модулем аудита действий (Audit Trail Engine).
              Все записи заверены цифровыми временными метками и сессионными идентификаторами. Нарушений целостности
              журнала не выявлено.
            </div>
            <div className="border-b border-dashed border-slate-400 pb-12 text-[10px] text-slate-400 italic">
              Место для особых отметок инспектора / замечаний комиссии:
            </div>
          </div>

          {/* Signatures & Seal Block */}
          <div className="mt-10 font-sans text-xs pt-4 border-t-2 border-slate-800">
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <div className="font-bold text-slate-800 mb-10">
                  Аудитор / Инспектор группы контроля МТМЗН РТ:
                </div>
                <div className="border-t border-slate-600 pt-1">
                  <span className="text-[10px] text-slate-500">(подпись / Ф.И.О.)</span>
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-800 mb-10">
                  Руководитель проекта (ГРП МТМЗН РТ):
                </div>
                <div className="border-t border-slate-600 pt-1">
                  <span className="text-[10px] text-slate-500">(подпись / Ф.И.О.)</span>
                </div>
              </div>

              <div>
                <div className="font-bold text-slate-800 mb-10">
                  Ответственный представитель Фасилитатора:
                </div>
                <div className="border-t border-slate-600 pt-1">
                  <span className="text-[10px] text-slate-500">(подпись / Ф.И.О.)</span>
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <div>Система: SPMEI Audit & Compliance System v2.6</div>
              <div className="text-center font-serif text-slate-400">М. П. (Место для печати)</div>
              <div>Хеш проверки: {protoNum}-SEC</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
PrintAuditProtocolView.displayName = "PrintAuditProtocolView";
