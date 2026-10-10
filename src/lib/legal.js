// Datos del responsable del tratamiento y textos legales.
// IMPORTANTE: los valores marcados con «COMPLETAR» los debe rellenar el titular
// del servicio antes de publicar. Los textos son un BORRADOR informativo y
// deben ser revisados por un profesional jurídico (RGPD / LOPDGDD).
export const LEGAL_VERSION = '2026-10-09'

export const CONTROLLER = {
  name: 'Xabat Elortza Rubio',
  taxId: '72837755K',
  address: 'Arrantzale Kalea 8, 20810 Orio',
  email: 'xr.running.coach@gmail.com',
}

const S = (title, ...paras) => ({ title, paras })

export const LEGAL = {
  privacy: {
    es: {
      title: 'Política de privacidad',
      sections: [
        S('1. Responsable', `${CONTROLLER.name} · ${CONTROLLER.taxId} · ${CONTROLLER.address} · ${CONTROLLER.email}.`),
        S('2. Qué datos tratamos', 'Datos de cuenta (nombre, correo), datos de perfil deportivo (edad, peso, altura, objetivos), anamnesis y datos de salud que introduces voluntariamente (lesiones, antecedentes, medicación), frecuencia cardíaca y valores fisiológicos (umbrales, HRV), registros de entrenamiento (duración, esfuerzo percibido, distancia, notas) y mensajes con tu entrenador.', 'Parte de estos datos son datos de salud (categoría especial, art. 9 RGPD).'),
        S('3. Finalidad y base jurídica', 'Prestar el servicio de planificación y seguimiento del entrenamiento (ejecución del contrato, art. 6.1.b) y tratar tus datos de salud para ese fin con tu consentimiento explícito (art. 9.2.a), que puedes retirar en cualquier momento.'),
        S('4. Destinatarios', 'Tu entrenador accede a los datos de tus planes y registros. Usamos Supabase como proveedor de alojamiento y base de datos (encargado del tratamiento) y GitHub Pages para servir la aplicación. No vendemos tus datos ni los usamos para publicidad.'),
        S('5. Conservación', 'Mientras mantengas la cuenta activa. Al solicitar la baja se eliminan tus datos, salvo los que deban conservarse por obligación legal.'),
        S('6. Tus derechos', `Acceso, rectificación, supresión, oposición, limitación y portabilidad. Puedes descargar tus datos desde Perfil → Descargar mis datos o escribir a ${CONTROLLER.email}. Si no te satisface la respuesta, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).`),
        S('7. Almacenamiento local', 'La aplicación guarda en tu navegador solo preferencias (tema, idioma) y la sesión. No usa cookies publicitarias ni de analítica. Las fuentes se sirven desde la propia aplicación.'),
      ],
    },
    eu: {
      title: 'Pribatutasun-politika',
      sections: [
        S('1. Arduraduna', `${CONTROLLER.name} · ${CONTROLLER.taxId} · ${CONTROLLER.address} · ${CONTROLLER.email}.`),
        S('2. Zer datu tratatzen ditugu', 'Kontuko datuak (izena, posta elektronikoa), kirol-profileko datuak (adina, pisua, altuera, helburuak), anamnesia eta nahita sartzen dituzun osasun-datuak (lesioak, aurrekariak, medikazioa), bihotz-maiztasuna eta balio fisiologikoak (atalaseak, HRV), entrenamendu-erregistroak (iraupena, nekearen pertzepzioa, distantzia, oharrak) eta entrenatzailearekin dituzun mezuak.', 'Datu horien zati bat osasun-datuak dira (kategoria berezia, DBEOren 9. artikulua).'),
        S('3. Helburua eta oinarri juridikoa', 'Entrenamenduaren plangintza eta jarraipena eskaintzea (kontratuaren betearazpena, 6.1.b) eta osasun-datuak helburu horretarako tratatzea zure baimen esplizituarekin (9.2.a), edozein unetan kendu dezakezuna.'),
        S('4. Hartzaileak', 'Zure entrenatzaileak zure planetako eta erregistroetako datuetara sartzen da. Supabase erabiltzen dugu ostatatze- eta datu-base hornitzaile gisa (tratamendu-eragilea) eta GitHub Pages aplikazioa zerbitzatzeko. Ez ditugu zure datuak saltzen ez publizitaterako erabiltzen.'),
        S('5. Gordetzea', 'Kontua aktibo mantentzen duzun bitartean. Baja eskatzean zure datuak ezabatzen dira, legezko betebehar bategatik gorde beharrekoak izan ezik.'),
        S('6. Zure eskubideak', `Sarbidea, zuzenketa, ezabatzea, aurkaratzea, murriztea eta eramangarritasuna. Zure datuak deskarga ditzakezu Profila → Deskargatu nire datuak atalean, edo idatzi ${CONTROLLER.email} helbidera. Erantzunarekin ados ez bazaude, Datuak Babesteko Espainiako Agentziari (aepd.es) erreklama diezaiokezu.`),
        S('7. Biltegiratze lokala', 'Aplikazioak zure nabigatzailean lehentasunak (gaia, hizkuntza) eta saioa soilik gordetzen ditu. Ez ditu publizitate- edo analitika-cookierik erabiltzen. Letra-tipoak aplikazioak berak zerbitzatzen ditu.'),
      ],
    },
  },
  terms: {
    es: {
      title: 'Términos de uso',
      sections: [
        S('1. Objeto', 'XR Running Coach es una plataforma de planificación y seguimiento de entrenamiento de atletismo, trail running y carreras de fondo.'),
        S('2. Naturaleza del servicio', 'La programación se basa en criterios fisiológicos y en los datos que registras. No garantiza resultados, marcas ni podios, y no sustituye el consejo médico. Antes de empezar o cambiar tu actividad física, consulta con un profesional sanitario, especialmente si tienes patologías previas.'),
        S('3. Tu cuenta', 'Eres responsable de la veracidad de los datos que introduces y de custodiar tu contraseña. Puedes solicitar la baja en cualquier momento.'),
        S('4. Uso adecuado', 'No está permitido intentar acceder a datos de otros usuarios, alterar el funcionamiento del servicio ni usarlo con fines ilícitos.'),
        S('5. Modificaciones', 'Podemos actualizar estos términos; los cambios relevantes se te comunicarán en la aplicación.'),
        S('6. Contacto', CONTROLLER.email),
      ],
    },
    eu: {
      title: 'Erabilera-baldintzak',
      sections: [
        S('1. Xedea', 'XR Running Coach atletismoaren, trail runningaren eta hondo-lasterketen entrenamendua planifikatzeko eta jarraitzeko plataforma da.'),
        S('2. Zerbitzuaren izaera', 'Programazioa irizpide fisiologikoetan eta zuk erregistratzen dituzun datuetan oinarritzen da. Ez ditu emaitzak, markak edo podiumak bermatzen, eta ez du aholku medikua ordezkatzen. Jarduera fisikoa hasi edo aldatu aurretik, kontsultatu osasun-profesional batekin, bereziki aurreko patologiak badituzu.'),
        S('3. Zure kontua', 'Zu zara sartzen dituzun datuen egiazkotasunaren eta pasahitzaren zaintzaren arduraduna. Edonoiz eska dezakezu baja.'),
        S('4. Erabilera egokia', 'Debekatuta dago beste erabiltzaileen datuetara sartzen saiatzea, zerbitzuaren funtzionamendua aldatzea edo xede ilegaletarako erabiltzea.'),
        S('5. Aldaketak', 'Baldintza hauek eguneratu ditzakegu; aldaketa garrantzitsuak aplikazioan jakinaraziko zaizkizu.'),
        S('6. Kontaktua', CONTROLLER.email),
      ],
    },
  },
}
