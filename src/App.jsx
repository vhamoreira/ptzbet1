import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Trophy, Lock, Unlock, ChevronDown, ChevronUp, Plus, RefreshCw, Check, X } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Estas são as chaves públicas ("anon") do Supabase — é seguro tê-las aqui no
// código do cliente. A segurança real vem das políticas de RLS da tabela
// app_storage (todos podem ler/escrever, tal como era no storage).
const SUPABASE_URL = 'https://eiphjwnycqorlddcfitw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0tP0CeVgysNLJk6S-fY0yA_qUN-jYvz';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Substitui o storage (só existe dentro de artefactos da Claude) por
// algo com a mesma forma: dados pessoais (shared=false) vão para o
// localStorage do browser; dados partilhados (shared=true) vão para o Supabase.
const storage = {
  async get(key, shared) {
    if (!shared) {
      try {
        const v = localStorage.getItem(key);
        return v !== null ? { key, value: v, shared } : null;
      } catch (e) {
        return null;
      }
    }
    const { data, error } = await supabase.from('app_storage').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { key, value: data.value, shared };
  },
  async set(key, value, shared) {
    if (!shared) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {}
      return { key, value, shared };
    }
    const { error } = await supabase
      .from('app_storage')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return { key, value, shared };
  },
  async delete(key, shared) {
    if (!shared) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
      return { key, deleted: true, shared };
    }
    const { error } = await supabase.from('app_storage').delete().eq('key', key);
    if (error) throw error;
    return { key, deleted: true, shared };
  },
  async list(prefix, shared) {
    if (!shared) {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!prefix || (k && k.startsWith(prefix))) keys.push(k);
      }
      return { keys, prefix, shared };
    }
    let query = supabase.from('app_storage').select('key');
    if (prefix) query = query.like('key', `${prefix}%`);
    const { data, error } = await query;
    if (error) throw error;
    return { keys: (data || []).map((d) => d.key), prefix, shared };
  },
};


const ADMIN_PIN = '2026';

// [group, date, time(24h, hora de Lisboa), teamA, teamB]
const RAW_MATCHES = [
  ['A', '2026-06-11', '19:00', 'México', 'África do Sul'],
  ['A', '2026-06-12', '01:00', 'Coreia do Sul', 'Chéquia'],
  ['A', '2026-06-18', '17:00', 'Chéquia', 'África do Sul'],
  ['A', '2026-06-19', '02:00', 'México', 'Coreia do Sul'],
  ['A', '2026-06-25', '02:00', 'África do Sul', 'Coreia do Sul'],
  ['A', '2026-06-25', '02:00', 'Chéquia', 'México'],

  ['B', '2026-06-12', '01:00', 'Canadá', 'Bósnia e Herzegovina'],
  ['B', '2026-06-13', '04:00', 'Catar', 'Suíça'],
  ['B', '2026-06-18', '20:00', 'Suíça', 'Bósnia e Herzegovina'],
  ['B', '2026-06-18', '23:00', 'Canadá', 'Catar'],
  ['B', '2026-06-24', '20:00', 'Suíça', 'Canadá'],
  ['B', '2026-06-24', '20:00', 'Bósnia e Herzegovina', 'Catar'],

  ['C', '2026-06-13', '21:00', 'Brasil', 'Marrocos'],
  ['C', '2026-06-14', '04:00', 'Haiti', 'Escócia'],
  ['C', '2026-06-19', '23:00', 'Escócia', 'Marrocos'],
  ['C', '2026-06-20', '01:30', 'Brasil', 'Haiti'],
  ['C', '2026-06-24', '23:00', 'Marrocos', 'Haiti'],
  ['C', '2026-06-24', '23:00', 'Escócia', 'Brasil'],

  ['D', '2026-06-13', '03:00', 'Estados Unidos', 'Paraguai'],
  ['D', '2026-06-14', '06:00', 'Austrália', 'Turquia'],
  ['D', '2026-06-19', '20:00', 'Estados Unidos', 'Austrália'],
  ['D', '2026-06-20', '04:00', 'Turquia', 'Paraguai'],
  ['D', '2026-06-26', '03:00', 'Turquia', 'Estados Unidos'],
  ['D', '2026-06-26', '03:00', 'Paraguai', 'Austrália'],

  ['E', '2026-06-14', '21:00', 'Alemanha', 'Curaçao'],
  ['E', '2026-06-15', '23:00', 'Costa do Marfim', 'Equador'],
  ['E', '2026-06-20', '21:00', 'Alemanha', 'Costa do Marfim'],
  ['E', '2026-06-21', '01:00', 'Equador', 'Curaçao'],
  ['E', '2026-06-25', '21:00', 'Curaçao', 'Costa do Marfim'],
  ['E', '2026-06-25', '21:00', 'Equador', 'Alemanha'],

  ['F', '2026-06-14', '23:00', 'Holanda', 'Japão'],
  ['F', '2026-06-15', '20:00', 'Suécia', 'Tunísia'],
  ['F', '2026-06-20', '18:00', 'Holanda', 'Suécia'],
  ['F', '2026-06-21', '05:00', 'Tunísia', 'Japão'],
  ['F', '2026-06-26', '00:00', 'Tunísia', 'Holanda'],
  ['F', '2026-06-26', '00:00', 'Japão', 'Suécia'],

  ['G', '2026-06-15', '20:00', 'Bélgica', 'Egito'],
  ['G', '2026-06-16', '21:00', 'Irão', 'Nova Zelândia'],
  ['G', '2026-06-21', '20:00', 'Bélgica', 'Irão'],
  ['G', '2026-06-22', '02:00', 'Nova Zelândia', 'Egito'],
  ['G', '2026-06-27', '04:00', 'Nova Zelândia', 'Bélgica'],
  ['G', '2026-06-27', '04:00', 'Egito', 'Irão'],

  ['H', '2026-06-15', '20:00', 'Espanha', 'Cabo Verde'],
  ['H', '2026-06-15', '23:00', 'Arábia Saudita', 'Uruguai'],
  ['H', '2026-06-21', '17:00', 'Espanha', 'Arábia Saudita'],
  ['H', '2026-06-21', '23:00', 'Uruguai', 'Cabo Verde'],
  ['H', '2026-06-27', '01:00', 'Cabo Verde', 'Arábia Saudita'],
  ['H', '2026-06-27', '01:00', 'Uruguai', 'Espanha'],

  ['I', '2026-06-16', '20:00', 'França', 'Senegal'],
  ['I', '2026-06-16', '23:00', 'Iraque', 'Noruega'],
  ['I', '2026-06-22', '22:00', 'França', 'Iraque'],
  ['I', '2026-06-23', '01:00', 'Noruega', 'Senegal'],
  ['I', '2026-06-26', '20:00', 'Noruega', 'França'],
  ['I', '2026-06-26', '20:00', 'Senegal', 'Iraque'],

  ['J', '2026-06-17', '02:00', 'Argentina', 'Argélia'],
  ['J', '2026-06-17', '05:00', 'Áustria', 'Jordânia'],
  ['J', '2026-06-22', '18:00', 'Argentina', 'Áustria'],
  ['J', '2026-06-23', '04:00', 'Jordânia', 'Argélia'],
  ['J', '2026-06-28', '03:00', 'Argélia', 'Áustria'],
  ['J', '2026-06-28', '03:00', 'Jordânia', 'Argentina'],

  ['K', '2026-06-17', '18:00', 'Portugal', 'RD Congo'],
  ['K', '2026-06-18', '03:00', 'Usbequistão', 'Colômbia'],
  ['K', '2026-06-23', '18:00', 'Portugal', 'Usbequistão'],
  ['K', '2026-06-24', '03:00', 'Colômbia', 'RD Congo'],
  ['K', '2026-06-28', '00:30', 'Colômbia', 'Portugal'],
  ['K', '2026-06-28', '00:30', 'RD Congo', 'Usbequistão'],

  ['L', '2026-06-17', '21:00', 'Inglaterra', 'Croácia'],
  ['L', '2026-06-18', '00:00', 'Gana', 'Panamá'],
  ['L', '2026-06-23', '21:00', 'Inglaterra', 'Gana'],
  ['L', '2026-06-24', '00:00', 'Panamá', 'Croácia'],
  ['L', '2026-06-27', '22:00', 'Panamá', 'Inglaterra'],
  ['L', '2026-06-27', '22:00', 'Croácia', 'Gana'],
];

const BASE_MATCHES = RAW_MATCHES.map(([group, date, time, teamA, teamB], i) => ({
  id: `m${i}`,
  group,
  date,
  time,
  teamA,
  teamB,
  stage: 'Fase de Grupos',
}));

// Esqueleto da fase eliminatória (datas e horas reais; as equipas vão sendo
// preenchidas pelo admin à medida que os grupos terminam — ver "editar equipas").
// [stage, matchNumber, date, time, teamA, teamB]
const RAW_KNOCKOUT = [
  ['Ronda de 32', 73, '2026-06-28', '20:00', '2º Grupo A', '2º Grupo B'],
  ['Ronda de 32', 76, '2026-06-29', '18:00', '1º Grupo C', '2º Grupo F'],
  ['Ronda de 32', 74, '2026-06-29', '21:30', '1º Grupo E', '3º (A/B/C/D/F)'],
  ['Ronda de 32', 75, '2026-06-30', '02:00', '1º Grupo F', '2º Grupo C'],
  ['Ronda de 32', 78, '2026-06-30', '18:00', '2º Grupo E', '2º Grupo I'],
  ['Ronda de 32', 77, '2026-06-30', '22:00', '1º Grupo I', '3º (C/D/F/G/H)'],
  ['Ronda de 32', 79, '2026-07-01', '02:00', '1º Grupo A', '3º (C/E/F/H/I)'],
  ['Ronda de 32', 80, '2026-07-01', '17:00', '1º Grupo L', '3º (E/H/I/J/K)'],
  ['Ronda de 32', 82, '2026-07-01', '21:00', '1º Grupo G', '3º (A/E/H/I/J)'],
  ['Ronda de 32', 81, '2026-07-02', '01:00', '1º Grupo D', '3º (B/E/F/I/J)'],
  ['Ronda de 32', 84, '2026-07-02', '20:00', '1º Grupo H', '2º Grupo J'],
  ['Ronda de 32', 83, '2026-07-03', '00:00', '2º Grupo K', '2º Grupo L'],
  ['Ronda de 32', 85, '2026-07-03', '04:00', '1º Grupo B', '3º (E/F/G/I/J)'],
  ['Ronda de 32', 88, '2026-07-03', '19:00', '2º Grupo D', '2º Grupo G'],
  ['Ronda de 32', 86, '2026-07-03', '23:00', '1º Grupo J', '2º Grupo H'],
  ['Ronda de 32', 87, '2026-07-04', '02:30', '1º Grupo K', '3º (D/E/I/J/L)'],

  ['Oitavos de Final', 90, '2026-07-04', '18:00', 'Vencedor J73', 'Vencedor J75'],
  ['Oitavos de Final', 89, '2026-07-04', '22:00', 'Vencedor J74', 'Vencedor J77'],
  ['Oitavos de Final', 91, '2026-07-05', '21:00', 'Vencedor J76', 'Vencedor J78'],
  ['Oitavos de Final', 92, '2026-07-06', '01:00', 'Vencedor J79', 'Vencedor J80'],
  ['Oitavos de Final', 93, '2026-07-06', '20:00', 'Vencedor J83', 'Vencedor J84'],
  ['Oitavos de Final', 94, '2026-07-07', '01:00', 'Vencedor J81', 'Vencedor J82'],
  ['Oitavos de Final', 95, '2026-07-07', '17:00', 'Vencedor J86', 'Vencedor J88'],
  ['Oitavos de Final', 96, '2026-07-07', '21:00', 'Vencedor J85', 'Vencedor J87'],

  ['Quartos de Final', 97, '2026-07-09', '21:00', 'Vencedor J89', 'Vencedor J90'],
  ['Quartos de Final', 98, '2026-07-10', '20:00', 'Vencedor J93', 'Vencedor J94'],
  ['Quartos de Final', 99, '2026-07-11', '22:00', 'Vencedor J91', 'Vencedor J92'],
  ['Quartos de Final', 100, '2026-07-12', '02:00', 'Vencedor J95', 'Vencedor J96'],

  ['Meias-Finais', 101, '2026-07-14', '20:00', 'Vencedor J97', 'Vencedor J98'],
  ['Meias-Finais', 102, '2026-07-15', '20:00', 'Vencedor J99', 'Vencedor J100'],

  ['3º Lugar', 103, '2026-07-18', '22:00', 'Perdedor J101', 'Perdedor J102'],
  ['Final', 104, '2026-07-19', '20:00', 'Vencedor J101', 'Vencedor J102'],
];

const KNOCKOUT_MATCHES = RAW_KNOCKOUT.map(([stage, matchNumber, date, time, teamA, teamB]) => ({
  id: `k${matchNumber}`,
  group: null,
  date,
  time,
  teamA,
  teamB,
  stage,
}));

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Convocados (best-effort, based on the final 26-man lists announced for the tournament).
// Used only to power the "marcador" dropdown — if a name is missing, players can pick "Outro".
const SQUADS = {
  'México': ['Raúl Rangel', 'Guillermo Ochoa', 'Carlos Acevedo', 'Jorge Sánchez', 'Israel Reyes', 'César Montes', 'Johan Vásquez', 'Jesús Gallardo', 'Mateo Chávez', 'Edson Álvarez', 'Erik Lira', 'Orbelín Pineda', 'Álvaro Fidalgo', 'Brian Gutiérrez', 'Luis Romo', 'Obed Vargas', 'Gilberto Mora', 'Luis Chávez', 'Roberto Alvarado', 'César Huerta', 'Alexis Vega', 'Julián Quiñones', 'Guillermo Martínez', 'Armando González', 'Santiago Giménez', 'Raúl Jiménez'],
  'África do Sul': ['Ronwen Williams', 'Ricardo Goss', 'Sipho Chaine', 'Aubrey Modiba', 'Khuliso Mudau', 'Nkosinathi Sibisi', 'Mbekezeli Mbokazi', 'Ime Okon', 'Samukele Kabini', 'Khulumani Ndamane', 'Thabang Matulidi', 'Kamogelo Sebelebele', 'Bradley Cross', 'Olwethu Makhanya', 'Teboho Mokoena', 'Sphephelo Sithole', 'Thalente Mbatha', 'Jayden Adams', 'Themba Zwane', 'Lyle Foster', 'Evidence Makgopa', 'Oswin Appollis', 'Iqraam Rayners', 'Relebohile Mofokeng', 'Thapelo Maseko', 'Tshepang Moremi'],
  'Coreia do Sul': ['Kim Seung-gyu', 'Song Bum-keun', 'Jo Hyeon-woo', 'Kim Moon-hwan', 'Kim Min-jae', 'Kim Tae-hyeon', 'Park Jin-seob', 'Seol Young-woo', 'Jens Castrop', 'Lee Ki-hyeok', 'Lee Tae-seok', 'Lee Han-beom', 'Cho Yu-min', 'Kim Jin-gyu', 'Bae Jun-ho', 'Paik Seung-ho', 'Yang Hyun-jun', 'Eom Ji-sung', 'Lee Kang-in', 'Lee Dong-gyeong', 'Lee Jae-sung', 'Hwang In-beom', 'Hwang Hee-chan', 'Son Heung-min', 'Oh Hyeon-gyu', 'Cho Gue-sung'],
  'Chéquia': ['Lukáš Horníček', 'Matěj Kovář', 'Jindřich Staněk', 'Vladimír Coufal', 'David Douděra', 'Tomáš Holeš', 'Robin Hranáč', 'Štěpán Chaloupek', 'David Jurásek', 'Ladislav Krejčí', 'Jaroslav Zelený', 'David Zima', 'Lukáš Červ', 'Vladimír Darida', 'Lukáš Provod', 'Michal Sadílek', 'Hugo Sochůrek', 'Alexandr Sojka', 'Tomáš Souček', 'Pavel Šulc', 'Denis Višinský', 'Adam Hložek', 'Tomáš Chorý', 'Mojmír Chytil', 'Jan Kuchta', 'Patrik Schick'],
  'Canadá': ['Maxime Crépeau', 'Owen Goodman', 'Dayne St Clair', 'Moïse Bombito', 'Derek Cornelius', 'Alphonso Davies', 'Luc de Fougerolles', 'Alistair Johnston', 'Alfie Jones', 'Richie Laryea', 'Niko Sigur', 'Joel Waterman', 'Ali Ahmed', 'Tajon Buchanan', 'Mathieu Choinière', 'Stephen Eustáquio', 'Jayden Nelson', 'Ismaël Koné', 'Liam Millar', 'Jonathan Osorio', 'Nathan Saliba', 'Jacob Shaffelburg', 'Jonathan David', 'Promise David', 'Cyle Larin', 'Tani Oluwaseyi'],
  'Bósnia e Herzegovina': ['Nikola Vasilj', 'Martin Zlomislić', 'Osman Hadžikić', 'Sead Kolašinac', 'Amar Dedić', 'Nihad Mujakić', 'Nikola Katić', 'Tarik Muharemović', 'Stjepan Radeljić', 'Dennis Hadžikadunić', 'Nidal Celik', 'Amir Hadžiahmetović', 'Ivan Šunjić', 'Ivan Bašić', 'Dženis Burnić', 'Ermin Mahmić', 'Benjamin Tahirović', 'Amar Memić', 'Armin Gigović', 'Kerim Alajbegović', 'Esmir Bajraktarević', 'Ermedin Demirović', 'Jovo Lukić', 'Samed Baždar', 'Haris Tabaković', 'Edin Džeko'],
  'Catar': ['Salah Zakaria', 'Meshaal Barsham', 'Mahmoud Abunada', 'Boualem Khoukhi', 'Pedro Miguel', 'Sultan Al Brake', 'Al Hashmi Al Hussain', 'Ayoub Al Alawi', 'Issa Laye', 'Lucas Mendes', 'Homam Al Amin', 'Ahmed Fathi', 'Jassim Gaber', 'Assim Madibo', 'Abdulaziz Hatem', 'Karim Boudiaf', 'Mohammed Mannai', 'Almoez Ali', 'Akram Afif', 'Tahsin Mohammed', 'Edmilson Junior', 'Ahmed Al-Janehi', 'Ahmed Alaa', 'Hassan Al Haydos', 'Mohammed Muntari', 'Yusuf Abdurisag'],
  'Suíça': ['Gregor Kobel', 'Yvon Mvogo', 'Marvin Keller', 'Manuel Akanji', 'Nico Elvedi', 'Ricardo Rodríguez', 'Silvan Widmer', 'Miro Muheim', 'Aurèle Amenda', 'Eray Cömert', 'Luca Jaquez', 'Granit Xhaka', 'Johan Manzambi', 'Remo Freuler', 'Denis Zakaria', 'Ardon Jashari', 'Djibril Sow', 'Christian Fassnacht', 'Michel Aebischer', 'Fabian Rieder', 'Rubén Vargas', 'Breel Embolo', 'Noah Okafor', 'Dan Ndoye', 'Zeki Amdouni', 'Cedric Itten'],
  'Brasil': ['Alisson', 'Ederson', 'Weverton', 'Marquinhos', 'Danilo Luiz', 'Alex Sandro', 'Gabriel Magalhães', 'Bremer', 'Wesley', 'Roger Ibañez', 'Douglas Santos', 'Léo Pereira', 'Casemiro', 'Lucas Paquetá', 'Bruno Guimarães', 'Fabinho', 'Danilo', 'Neymar', 'Vinícius Júnior', 'Raphinha', 'Gabriel Martinelli', 'Matheus Cunha', 'Endrick', 'Luiz Henrique', 'Igor Thiago', 'Rayan'],
  'Marrocos': ['Yassine Bounou', 'Munir El Kajoui', 'Ahmed Reda Tagnaouti', 'Achraf Hakimi', 'Noussair Mazraoui', 'Nayef Aguerd', 'Chadi Riad', 'Issa Diop', 'Anass Salah-Eddine', 'Zakaria El Ouahdi', 'Redouane Halhal', 'Youssef Belammari', 'Sofyan Amrabat', 'Azzedine Ounahi', 'Neil El Aynaoui', 'Bilal El Khannouss', 'Ismael Saibari', 'Samir El Mourabet', 'Ayyoub Bouaddi', 'Gessime Yassine', 'Brahim Díaz', 'Ayoub El Kaabi', 'Abde Ezzalzouli', 'Soufiane Rahimi', 'Chemsdine Talbi', 'Ayoube Amaimouni'],
  'Haiti': ['Johny Placide', 'Alexandre Pierre', 'Josué Duverger', 'Carlens Arcus', 'Wilguens Paugain', 'Duke Lacroix', 'Martin Expérience', 'Jean-Kévin Duverne', 'Ricardo Adé', 'Hannes Delcroix', 'Keeto Thermoncy', 'Leverton Pierre', 'Carl-Fred Sainthé', 'Danley Jean Jacques', 'Jean-Ricner Bellegarde', 'Pierre Woodensky', 'Dominique Simon', 'Don Deedson Louicius', 'Ruben Providence', 'Josué Casimir', 'Derrick Etienne Jr.', 'Wilson Isidor', 'Duckens Nazon', 'Frantzdy Pierrot', 'Yassin Fortuné', 'Lenny Joseph'],
  'Escócia': ['Craig Gordon', 'Angus Gunn', 'Liam Kelly', 'Grant Hanley', 'Jack Hendry', 'Aaron Hickey', 'Dom Hyam', 'Scott McKenna', 'Nathan Patterson', 'Anthony Ralston', 'Andy Robertson', 'John Souttar', 'Kieran Tierney', 'Ryan Christie', 'Findlay Curtis', 'Lewis Ferguson', 'Ben Gannon-Doak', 'Billy Gilmour', 'John McGinn', 'Kenny McLean', 'Scott McTominay', 'Ché Adams', 'Lyndon Dykes', 'George Hirst', 'Lawrence Shankland', 'Ross Stewart'],
  'Estados Unidos': ['Matt Turner', 'Matt Freese', 'Chris Brady', 'Sergiño Dest', 'Chris Richards', 'Antonee Robinson', 'Auston Trusty', 'Miles Robinson', 'Tim Ream', 'Alex Freeman', 'Max Arfsten', 'Mark McKenzie', 'Joe Scally', 'Tyler Adams', 'Gio Reyna', 'Weston McKennie', 'Sebastian Berhalter', 'Cristian Roldan', 'Malik Tillman', 'Ricardo Pepi', 'Christian Pulisic', 'Brenden Aaronson', 'Haji Wright', 'Folarin Balogun', 'Tim Weah', 'Alejandro Zendejas'],
  'Paraguai': ['Orlando Gill', 'Roberto Fernández', 'Gastón Olveira', 'Juan Cáceres', 'Gustavo Velázquez', 'Gustavo Gómez', 'Junior Alonso', 'José Canale', 'Omar Alderete', 'Alexandro Maidana', 'Fabián Balbuena', 'Diego Gómez', 'Mauricio Magalhães', 'Damián Bobadilla', 'Braian Ojeda', 'Andrés Cubas', 'Matías Galarza', 'Alejandro Gamarra', 'Gustavo Caballero', 'Ramón Sosa', 'Alex Arce', 'Isidro Pitta', 'Gabriel Ávalos', 'Miguel Almirón', 'Julio Enciso', 'Antonio Sanabria'],
  'Austrália': ['Patrick Beach', 'Paul Izzo', 'Mathew Ryan', 'Aziz Behich', 'Jordan Bos', 'Cameron Burgess', 'Alessandro Circati', 'Milos Degenek', 'Jason Geria', 'Lucas Herrington', 'Jacob Italiano', 'Harry Souttar', 'Kai Trewin', 'Cameron Devlin', 'Ajdin Hrustic', 'Jackson Irvine', 'Connor Metcalfe', "Aiden O'Neill", 'Paul Okon-Engstler', 'Nestory Irankunda', 'Mathew Leckie', 'Awer Mabil', 'Mohamed Toure', 'Nishan Velupillay', 'Cristian Volpato', 'Tete Yengi'],
  'Turquia': ['Altay Bayındır', 'Mert Günok', 'Uğurcan Çakır', 'Abdülkerim Bardakcı', 'Çağlar Söyüncü', 'Eren Elmalı', 'Ferdi Kadıoğlu', 'Merih Demiral', 'Mert Müldür', 'Ozan Kabak', 'Samet Akaydın', 'Zeki Çelik', 'Hakan Çalhanoğlu', 'İsmail Yüksek', 'Kaan Ayhan', 'Orkun Kökçü', 'Salih Özcan', 'Arda Güler', 'Barış Alper Yılmaz', 'Can Uzun', 'Deniz Gül', 'İrfan Can Kahveci', 'Kenan Yıldız', 'Kerem Aktürkoğlu', 'Oğuz Aydın', 'Yunus Akgün'],
  'Alemanha': ['Manuel Neuer', 'Oliver Baumann', 'Alexander Nübel', 'Antonio Rüdiger', 'Waldemar Anton', 'Jonathan Tah', 'Nico Schlotterbeck', 'Nathaniel Brown', 'David Raum', 'Malick Thiaw', 'Aleksandar Pavlović', 'Joshua Kimmich', 'Leon Goretzka', 'Jamie Leweling', 'Jamal Musiala', 'Pascal Groß', 'Angelo Stiller', 'Florian Wirtz', 'Leroy Sané', 'Nadiem Amiri', 'Felix Nmecha', 'Lennart Karl', 'Kai Havertz', 'Nick Woltemade', 'Maximilian Beier', 'Deniz Undav'],
  'Curaçao': ['Eloy Room', 'Trevor Doornbusch', 'Tyrick Bodak', 'Jurien Gaari', 'Roshon van Eijma', 'Sherel Floranus', 'Joshua Brenet', 'Shurandy Sambo', 'Armando Obispo', 'Riechedly Bazoer', 'Deveron Fonville', 'Leandro Bacuna', 'Juninho Bacuna', 'Godfried Roemeratoe', 'Kevin Felida', 'Livano Comenencia', "Ar'jany Martha", 'Tyrese Noslin', 'Kenji Gorré', 'Brandley Kuwas', 'Gervane Kastaneer', 'Jeremy Antonisse', 'Jearl Margaritha', 'Jürgen Locadia', 'Sontje Hansen', 'Tahith Chong'],
  'Costa do Marfim': ['Yahia Fofana', 'Mohamed Koné', 'Alban Lafont', 'Emmanuel Agbadou', 'Clément Akpa', 'Ousmane Diomandé', 'Guela Doué', 'Ghislain Konan', 'Odilon Kossounou', 'Evan Ndicka', 'Wilfried Singo', 'Seko Fofana', 'Parfait Guiagon', 'Christ Inao Oulaï', 'Franck Kessié', 'Ibrahim Sangaré', 'Jean-Michaël Seri', 'Simon Adingra', 'Ange-Yoan Bonny', 'Amad Diallo', 'Oumar Diakité', 'Yan Diomande', 'Evann Guessand', 'Nicolas Pépé', 'Bazoumana Touré', 'Elye Wahi'],
  'Equador': ['Hernán Galíndez', 'Moisés Ramírez', 'Gonzalo Valle', 'Piero Hincapié', 'Willian Pacho', 'Pervis Estupiñán', 'Félix Torres', 'Joel Ordóñez', 'Jackson Porozo', 'Ángelo Preciado', 'Yaimar Medina', 'Moisés Caicedo', 'Alan Franco', 'Kendry Páez', 'Gonzalo Plata', 'Pedro Vite', 'Jordy Alcívar', 'Denil Castillo', 'John Yeboah', 'Nilson Angulo', 'Alan Minda', 'Enner Valencia', 'Kevin Rodríguez', 'Jordy Caicedo', 'Anthony Valencia', 'Jeremy Arévalo'],
  'Holanda': ['Mark Flekken', 'Robin Roefs', 'Bart Verbruggen', 'Nathan Aké', 'Denzel Dumfries', 'Jorrel Hato', 'Jurriën Timber', 'Micky van de Ven', 'Virgil van Dijk', 'Jan Paul van Hecke', 'Mats Wieffer', 'Frenkie de Jong', 'Marten de Roon', 'Ryan Gravenberch', 'Justin Kluivert', 'Teun Koopmeiners', 'Tijjani Reijnders', 'Guus Til', 'Quinten Timber', 'Brian Brobbey', 'Memphis Depay', 'Cody Gakpo', 'Noa Lang', 'Donyell Malen', 'Crysencio Summerville', 'Wout Weghorst'],
  'Japão': ['Zion Suzuki', 'Keisuke Osako', 'Tomoki Hayakawa', 'Hiroki Ito', 'Ko Itakura', 'Takehiro Tomiyasu', 'Tsuyoshi Watanabe', 'Yukinari Sugawara', 'Shogo Taniguchi', 'Ayumu Seko', 'Yuto Nagatomo', 'Wataru Endo', 'Kaishu Sano', 'Daichi Kamada', 'Ao Tanaka', 'Junya Ito', 'Takefusa Kubo', 'Ritsu Doan', 'Keito Nakamura', 'Junnosuke Suzuki', 'Yuito Suzuki', 'Daizen Maeda', 'Ayase Ueda', 'Koki Ogawa', 'Keisuke Goto', 'Kento Shiogai'],
  'Suécia': ['Kristoffer Nordfeldt', 'Viktor Johansson', 'Jacob Widell Zetterström', 'Gustaf Lagerbielke', 'Victor Lindelöf', 'Gabriel Gudmundsson', 'Daniel Svensson', 'Elliot Stroud', 'Carl Starfelt', 'Isak Hien', 'Emil Holm', 'Hjalmar Ekdal', 'Eric Smith', 'Lucas Bergvall', 'Jesper Karlström', 'Yasin Ayari', 'Mattias Svanberg', 'Besfort Zeneli', 'Ken Sema', 'Gustaf Nilsson', 'Benjamin Nygren', 'Anthony Elanga', 'Viktor Gyökeres', 'Taha Ali', 'Alexander Isak', 'Alexander Bernhardsson'],
  'Tunísia': ['Aymen Dahmen', 'Sabri Ben Hassine', 'Mohib Al-Shamikhi', 'Montassar Talbi', 'Dylan Bronn', 'Omar Rekik', 'Yan Valery', 'Ali Abdi', 'Moataz Nafati', 'Raed Sheikhawi', 'Adem Arous', 'Ellyes Skhiri', 'Hannibal Mejbri', 'Amine Ben Hamida', 'Anis Ben Slimane', 'Mohamed Haj Mahmoud', 'Rani Khedira', 'Mortadha Ben Ouanes', 'Elias Achouri', 'Ismael Gharbi', 'Elyes Saad', 'Sebastian Tounekti', 'Firas Chaouat', 'Khalil Ayari', 'Hazem Mestouri', 'Rayan Loumi'],
  'Bélgica': ['Thibaut Courtois', 'Senne Lammens', 'Mike Penders', 'Timothy Castagne', 'Zeno Debast', 'Maxim De Cuyper', 'Koni De Winter', 'Brandon Mechele', 'Thomas Meunier', 'Nathan Ngoy', 'Joaquin Seys', 'Arthur Theate', 'Kevin De Bruyne', 'Amadou Onana', 'Nicolas Raskin', 'Youri Tielemans', 'Hans Vanaken', 'Axel Witsel', 'Charles De Ketelaere', 'Jérémy Doku', 'Matias Fernandez-Pardo', 'Romelu Lukaku', 'Dodi Lukebakio', 'Diego Moreira', 'Alexis Saelemaekers', 'Leandro Trossard'],
  'Egito': ['Mohamed El Shenawy', 'Mostafa Shobeir', 'El Mahdy Soliman', 'Mohamed Alaa', 'Mohamed Abdelmonem', 'Mohamed Hany', 'Yasser Ibrahim', 'Hossam Abdelmaguid', 'Ahmed Fattouh', 'Tarek Alaa', 'Rami Rabia', 'Karim Hafez', 'Marwan Attia', 'Ahmed Sayed Zizo', 'Mahmoud Hassan Trezeguet', 'Emam Ashour', 'Mostafa Abdel Raouf', 'Mohannad Lasheen', 'Haitham Hassan', 'Mahmoud Saber', 'Ibrahim Adel', 'Nabil Emad', 'Hamdi Fathi', 'Mohamed Salah', 'Omar Marmoush', 'Hamza Abdel Karim'],
  'Irão': ['Alireza Beiranvand', 'Seyed Hossein Hosseini', 'Payam Niazmand', 'Danial Eiri', 'Ehsan Hajsafi', 'Saleh Hardani', 'Hossein Kanaani', 'Shojae Khalilzadeh', 'Milad Mohammadi', 'Ali Nemati', 'Ramin Rezaeian', 'Aria Yousefi', 'Rouzbeh Cheshmi', 'Saeid Ezatolahi', 'Mehdi Ghaedi', 'Saman Ghoddos', 'Mohammad Ghorbani', 'Alireza Jahanbakhsh', 'Mohammad Mohebi', 'Amir Mohammad Razzaghinia', 'Mehdi Torabi', 'Ali Alipour', 'Dennis Dargahi', 'Amirhossein Hosseinzadeh', 'Mehdi Taremi', 'Shahriar Moghanlou'],
  'Nova Zelândia': ['Max Crocombe', 'Alex Paulsen', 'Michael Woud', 'Tyler Bindon', 'Michael Boxall', 'Liberato Cacace', 'Francis de Vries', 'Callan Elliot', 'Tim Payne', 'Nando Pijnaker', 'Tommy Smith', 'Finn Surman', 'Lachlan Bayliss', 'Joe Bell', 'Matt Garbett', 'Ben Old', 'Alex Rufer', 'Sarpreet Singh', 'Marko Stamenić', 'Ryan Thomas', 'Kosta Barbarouses', 'Eli Just', 'Callum McCowatt', 'Jesse Randall', 'Ben Waine', 'Chris Wood'],
  'Espanha': ['Unai Simón', 'David Raya', 'Joan García', 'Aymeric Laporte', 'Marc Cucurella', 'Marcos Llorente', 'Eric García', 'Pedro Porro', 'Álex Grimaldo', 'Pau Cubarsí', 'Marc Pubill', 'Rodri', 'Dani Olmo', 'Mikel Merino', 'Fabián Ruiz', 'Pedri', 'Gavi', 'Martín Zubimendi', 'Ferran Torres', 'Mikel Oyarzabal', 'Nico Williams', 'Lamine Yamal', 'Yeremy Pino', 'Álex Baena', 'Borja Iglesias', 'Víctor Muñoz'],
  'Cabo Verde': ['Vozinha', 'Marcio Rosa', 'CJ dos Santos', 'Stopira', 'Roberto Lopes', 'João Paulo', 'Diney', 'Logan Costa', 'Steven Moreira', 'Wagner Pina', 'Sidny Lopes Cabral', 'Kelvin Pires', 'Jamiro Monteiro', 'Kevin Pina', 'Deroy Duarte', 'Telmo Arcanjo', 'Laros Duarte', 'Yannick Semedo', 'Ryan Mendes', 'Garry Rodrigues', 'Willy Semedo', 'Jovane Cabral', 'Gilson Tavares', 'Dailon Livramento', 'Helio Varela', 'Nuno da Costa'],
  'Arábia Saudita': ['Nawaf Al Aqidi', 'Mohamed Al Owais', 'Ahmed Alkassar', 'Saud Abdulhamid', 'Jehad Thakri', 'Abdulelah Al Amri', 'Hassan Tambakti', 'Ali Lajami', 'Hassan Kadesh', 'Moteb Al Harbi', 'Nawaf Boushal', 'Ali Majrashi', 'Mohammed Abu Alshamat', 'Ziyad Al Johani', 'Nasser Al Dawsari', 'Mohamed Kanno', 'Abdullah Al Khaibari', 'Alaa Al Hejji', 'Musab Al Juwayr', 'Sultan Mandash', 'Ayman Yahya', 'Khalid Al Ghannam', 'Salem Al Dawsari', 'Abdullah Al Hamdan', 'Feras Al Brikan', 'Saleh Al Shehri'],
  'Uruguai': ['Sergio Rochet', 'Fernando Muslera', 'Santiago Mele', 'Guillermo Varela', 'Ronald Araújo', 'José María Giménez', 'Santiago Bueno', 'Sebastián Cáceres', 'Mathías Olivera', 'Joaquín Piquerez', 'Matías Viña', 'Maximiliano Araújo', 'Giorgian de Arrascaeta', 'Rodrigo Bentancur', 'Agustín Canobbio', 'Nicolás de la Cruz', 'Emiliano Martínez', 'Facundo Pellistri', 'Brian Rodríguez', 'Juan Manuel Sanabria', 'Manuel Ugarte', 'Federico Valverde', 'Rodrigo Zalazar', 'Rodrigo Aguirre', 'Federico Viñas', 'Darwin Núñez'],
  'França': ['Mike Maignan', 'Robin Risser', 'Brice Samba', 'Lucas Digne', 'Malo Gusto', 'Lucas Hernández', 'Théo Hernández', 'Ibrahima Konaté', 'Jules Koundé', 'Maxence Lacroix', 'William Saliba', 'Dayot Upamecano', "N'Golo Kanté", 'Manu Koné', 'Adrien Rabiot', 'Aurélien Tchouaméni', 'Warren Zaïre-Emery', 'Maghnes Akliouche', 'Bradley Barcola', 'Rayan Cherki', 'Ousmane Dembélé', 'Désiré Doué', 'Jean-Philippe Mateta', 'Kylian Mbappé', 'Michael Olise', 'Marcus Thuram'],
  'Senegal': ['Édouard Mendy', 'Mory Diaw', 'Yehvann Diouf', 'Krépin Diatta', 'Antoine Mendy', 'Kalidou Koulibaly', 'El-Hadji Malick Diouf', 'Mamadou Sarr', 'Moussa Niakhaté', 'Abdoulaye Seck', 'Ismaïl Jakobs', 'Idrissa Gana Gueye', 'Pape Gueye', 'Lamine Camara', 'Habib Diarra', 'Pathé Ciss', 'Pape Matar Sarr', 'Bara Sapoko Ndiaye', 'Sadio Mané', 'Ismaïla Sarr', 'Iliman Ndiaye', 'Assane Diao', 'Ibrahim Mbaye', 'Nicolas Jackson', 'Bamba Dieng', 'Chérif Ndiaye'],
  'Iraque': ['Fahad Talib', 'Jalal Hassan', 'Ahmed Basil', 'Hussein Ali', 'Manaf Younis', 'Zaid Tahseen', 'Rebin Sulaka', 'Akam Hashem', 'Merchas Doski', 'Ahmed Yahya', 'Zaid Ismail', 'Frans Putros', 'Mustafa Saadoon', 'Amir Al Ammari', 'Kevin Yakob', 'Zidane Iqbal', 'Aimar Sher', 'Ibrahim Bayesh', 'Ahmed Qasim', 'Youssef Amyn', 'Marko Farji', 'Ali Jassim', 'Ali Al Hamadi', 'Ali Yousef', 'Aymen Hussein', 'Mohanad Ali'],
  'Noruega': ['Ørjan Nyland', 'Sander Tangvik', 'Egil Selvik', 'Kristoffer Ajer', 'Leo Skiri Østigård', 'David Møller Wolfe', 'Fredrik André Bjørkan', 'Marcus Holmgren Pedersen', 'Torbjørn Heggem', 'Sondre Langås', 'Henrik Falchener', 'Julian Ryerson', 'Morten Thorsby', 'Patrick Berg', 'Sander Berge', 'Martin Ødegaard', 'Fredrik Aursnes', 'Kristian Thorstvedt', 'Thelo Aasgaard', 'Antonio Nusa', 'Andreas Schjelderup', 'Oscar Bobb', 'Jens Petter Hauge', 'Alexander Sørloth', 'Erling Haaland', 'Jørgen Strand Larsen'],
  'Argentina': ['Juan Musso', 'Gerónimo Rulli', 'Emiliano Martínez', 'Leonardo Balerdi', 'Nicolás Tagliafico', 'Gonzalo Montiel', 'Lisandro Martínez', 'Cristian Romero', 'Nicolás Otamendi', 'Facundo Medina', 'Nahuel Molina', 'Leandro Paredes', 'Rodrigo De Paul', 'Valentín Barco', 'Giovani Lo Celso', 'Exequiel Palacios', 'Alexis Mac Allister', 'Enzo Fernández', 'Julián Álvarez', 'Lionel Messi', 'Nicolás González', 'Thiago Almada', 'Giuliano Simeone', 'Nico Paz', 'José Manuel López', 'Lautaro Martínez'],
  'Argélia': ['Oussama Benbot', 'Melvin Masstil', 'Luca Zidane', 'Achraf Abada', 'Rayan Aït-Nouri', 'Zinedine Belaïd', 'Rafik Belghali', 'Ramy Bensebaini', 'Samir Chergui', 'Jaouen Hadjam', 'Aïssa Mandi', 'Mohamed Amine Tougaï', 'Houssem Aouar', 'Nabil Bentaleb', 'Hicham Boudaoui', 'Farès Chaibi', 'Ibrahim Maza', 'Yassine Titraoui', 'Ramiz Zerrouki', 'Mohamed Amine Amoura', 'Nadir Benbouali', 'Adil Boulbina', 'Farès Ghedjemis', 'Amine Gouiri', 'Riyad Mahrez', 'Anis Hadj Moussa'],
  'Áustria': ['Alexander Schlager', 'Patrick Pentz', 'Florian Wiegele', 'David Affengruber', 'David Alaba', 'Kevin Danso', 'Marco Friedl', 'Philipp Lienhart', 'Phillipp Mwene', 'Stefan Posch', 'Alexander Prass', 'Michael Svoboda', 'Christoph Baumgartner', 'Carney Chukwuemeka', 'Florian Grillitsch', 'Konrad Laimer', 'Marcel Sabitzer', 'Xaver Schlager', 'Romano Schmid', 'Alessandro Schöpf', 'Nicolas Seiwald', 'Paul Wanner', 'Patrick Wimmer', 'Marko Arnautović', 'Michael Gregoritsch', 'Saša Kalajdžić'],
  'Jordânia': ['Yazid Abulaila', 'Noor Bani Attiah', 'Abdallah Al Fakhouri', 'Mohammad Abu Hashish', 'Abdullah Nasib', 'Hussam Abu Dhahab', 'Yazan Al Arab', 'Mohammad Abu Alnadi', 'Salem Obaid', 'Saed Al Rosan', 'Ehsan Haddad', 'Anas Badawi', 'Amer Jamous', 'Noor Al Rawabdeh', 'Rajaei Ayed', 'Ibrahim Sadeh', 'Mohannad Abu Taha', 'Nizar Al Rashdan', 'Mohammad Al Dawoud', 'Mahmoud Mardahi', 'Mohammad Abu Zraiq', 'Ali Olwan', 'Mousa Al Tamari', 'Odeh Fakhoury', 'Ibrahim Sabra', 'Ali Azaizeh'],
  'Portugal': ['Diogo Costa', 'José Sá', 'Rui Silva', 'Rúben Dias', 'João Cancelo', 'Nélson Semedo', 'Nuno Mendes', 'Diogo Dalot', 'Gonçalo Inácio', 'Renato Veiga', 'Tomás Araújo', 'Bernardo Silva', 'Bruno Fernandes', 'Rúben Neves', 'Vitinha', 'João Neves', 'Matheus Nunes', 'Francisco Trincão', 'Samu Costa', 'Cristiano Ronaldo', 'João Félix', 'Rafael Leão', 'Gonçalo Guedes', 'Gonçalo Ramos', 'Pedro Neto', 'Francisco Conceição'],
  'RD Congo': ['Lionel Mpasi', 'Timothy Fayulu', 'Matthieu Epolo', 'Chancel Mbemba', 'Arthur Masuaku', 'Gédéon Kalulu', 'Joris Kayembe', 'Dylan Batubinsika', 'Axel Tuanzebe', 'Aaron Wan-Bissaka', 'Steve Kapuadi', 'Meschack Elia', 'Samuel Moutoussamy', 'Edo Kayembe', 'Theo Bongonda', 'Charles Pickel', 'Gaël Kakuta', 'Noah Sadiki', 'Nathanaël Mbuku', 'Aaron Tshibola', "Ngal'ayel Mukau", 'Brian Cipenga', 'Cédric Bakambu', 'Fiston Mayele', 'Yoane Wissa', 'Simon Banza'],
  'Usbequistão': ['Botirali Ergashev', 'Abduvohid Nematov', 'Utkir Yusupov', 'Abdukodir Khusanov', 'Khojiakbar Alijonov', 'Rustamjon Ashurmatov', 'Farrukh Sayfiev', 'Sherzod Nasrullaev', 'Umarbek Eshmuradov', 'Avazbek Ulmasaliev', 'Jakhongir Urozov', 'Bekhruz Karimov', 'Abdulla Abdullaev', 'Akmal Mozgovoy', 'Otabek Shukurov', 'Jamshid Iskanderov', 'Odiljon Hamrobekov', 'Jaloliddin Masharipov', 'Azizbek Ganiev', 'Sherzod Esanov', 'Abbosbek Fayzullaev', 'Azizbek Amonov', 'Eldor Shomurodov', 'Igor Sergeev', 'Oston Urunov', 'Dostonbek Hamdamov'],
  'Colômbia': ['David Ospina', 'Camilo Vargas', 'Álvaro Montero', 'Kevin Mier', 'Johan Mojica', 'Cristian Borja', 'Daniel Muñoz', 'Santiago Arias', 'Yerry Mina', 'Davinson Sánchez', 'Jhon Lucumí', 'Yerson Mosquera', 'Juan Cabal', 'Deiver Machado', 'Willer Ditta', 'James Rodríguez', 'Jefferson Lerma', 'Jhon Arias', 'Richard Ríos', 'Juan Fernando Quintero', 'Jorge Carrascal', 'Kevin Castaño', 'Yáser Asprilla', 'Luis Díaz', 'Jhon Córdoba', 'Luis Suárez', 'Cucho Hernández', 'Carlos Andrés Gómez'],
  'Gana': ['Joseph Anang', 'Benjamin Asare', 'Lawrence Ati-Zigi', 'Jonas Adjetey', 'Derrick Luckassen', 'Gideon Mensah', 'Abdul Mumin', 'Jerome Opoku', 'Kojo Oppong Preprah', 'Baba Abdul Rahman', 'Alidu Seidu', 'Marvin Senaya', 'Augustine Boakye', 'Abdul Fatawu Issahaku', 'Elisha Owusu', 'Thomas Partey', 'Kwasi Sibo', 'Kamal Deen Sulemana', 'Caleb Yirenkyi', 'Prince Kwabena Adu', 'Jordan Ayew', 'Christopher Bonsu Baah', 'Ernest Nuamah', 'Antoine Semenyo', 'Brandon Thomas-Asante', 'Iñaki Williams'],
  'Panamá': ['Luis Mejía', 'Orlando Mosquera', 'César Samudio', 'Eric Davis', 'Fidel Escobar', 'Michael Amir Murillo', 'Roderick Miller', 'Andrés Andrade', 'César Blackman', 'José Córdoba', 'Jiovany Ramos', 'Jorge Gutiérrez', 'Edgardo Fariña', 'Aníbal Godoy', 'Alberto Quintero', 'Yoel Bárcenas', 'Adalberto Carrasquilla', 'José Luis Rodríguez', 'Cristian Martínez', 'César Yanis', 'Carlos Harvey', 'Azarías Londoño', 'José Fajardo', 'Ismael Díaz', 'Cecilio Waterman', 'Tomás Rodríguez'],
  'Inglaterra': ['Jordan Pickford', 'Dean Henderson', 'James Trafford', 'Reece James', 'Dan Burn', 'Marc Guéhi', 'Ezri Konsa', 'Tino Livramento', "Nico O'Reilly", 'Jarell Quansah', 'John Stones', 'Djed Spence', 'Elliot Anderson', 'Jude Bellingham', 'Jordan Henderson', 'Declan Rice', 'Kobbie Mainoo', 'Eberechi Eze', 'Anthony Gordon', 'Noni Madueke', 'Morgan Rogers', 'Bukayo Saka', 'Marcus Rashford', 'Harry Kane', 'Ivan Toney', 'Ollie Watkins'],
  'Croácia': ['Dominik Livaković', 'Dominik Kotarski', 'Ivor Pandur', 'Joško Gvardiol', 'Duje Ćaleta-Car', 'Josip Šutalo', 'Josip Stanišić', 'Marin Pongračić', 'Martin Erlić', 'Luka Vušković', 'Luka Modrić', 'Mateo Kovačić', 'Mario Pašalić', 'Nikola Vlašić', 'Luka Sučić', 'Martin Baturina', 'Kristijan Jakić', 'Petar Sučić', 'Nikola Moro', 'Toni Fruk', 'Ivan Perišić', 'Andrej Kramarić', 'Ante Budimir', 'Marco Pašalić', 'Petar Musa', 'Igor Matanović'],
};

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]}, ${d} ${MONTHS[m - 1]}`;
}

function slug(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 40) || 'jogador'
  );
}

function outcomeOf(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (x > y) return 'A';
  if (y > x) return 'B';
  return 'D';
}

function pointsFor(pick, result) {
  if (!pick || !result || !result.finished) return { scorer: 0, outcome: 0, exact: 0, qualify: 0, total: 0 };
  let scorer = 0;
  let outcome = 0;
  let exact = 0;
  let qualify = 0;

  // Para o VED, usa o placar dos 90 minutos se disponível (jogos com prorrogação).
  // O resultado exato usa sempre o placar final.
  const vedA = (result.scoreA90 !== '' && result.scoreA90 !== undefined && result.scoreA90 !== null)
    ? result.scoreA90 : result.scoreA;
  const vedB = (result.scoreB90 !== '' && result.scoreB90 !== undefined && result.scoreB90 !== null)
    ? result.scoreB90 : result.scoreB;
  const actual = outcomeOf(vedA, vedB);
  if (pick.outcome === actual) outcome = 3;
  if (
    pick.scoreA !== '' && pick.scoreA !== undefined &&
    pick.scoreB !== '' && pick.scoreB !== undefined &&
    Number(pick.scoreA) === Number(result.scoreA) &&
    Number(pick.scoreB) === Number(result.scoreB)
  ) exact = 5;
  if (pick.scorer && pick.scorer.trim() && result.scorers && result.scorers.length) {
    const normStr = (s) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const target = normStr(pick.scorer);
    scorer = result.scorers.filter((s) => {
      const n = normStr(s);
      if (n === target) return true;
      const lastA = target.split(' ').pop();
      const lastB = n.split(' ').pop();
      if (lastA && lastA.length > 2 && lastA === lastB) return true;
      if (n.includes(target) || target.includes(n)) return true;
      return false;
    }).length;
  }
  if (pick.qualifier && result.qualifier && pick.qualifier === result.qualifier) qualify = 2;
  return { scorer, outcome, exact, qualify, total: scorer + outcome + exact + qualify };
}

// Avalia o estado parcial de cada dimensão de aposta durante o jogo ao vivo.
// Devolve 'winning' | 'losing' | 'open' para cada dimensão.
// 'open' = ainda é possível ganhar (ex: estamos 0-0 e apostou 1-0)
// 'winning' = está a ganhar neste momento
// 'losing' = já não é possível ganhar (matematicamente impossível)
function liveStatusFor(pick, result) {
  if (!pick || !result || !result.live) return null;
  const normStr = (s) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const sA = Number(result.scoreA) || 0;
  const sB = Number(result.scoreB) || 0;
  const pA = pick.scoreA !== '' && pick.scoreA !== undefined ? Number(pick.scoreA) : null;
  const pB = pick.scoreB !== '' && pick.scoreB !== undefined ? Number(pick.scoreB) : null;

  // Resultado exato: impossível se já há mais golos do que o apostado em qualquer equipa
  let exact = 'open';
  if (pA !== null && pB !== null) {
    if (sA > pA || sB > pB) exact = 'losing';
    else if (sA === pA && sB === pB) exact = 'winning';
  }

  // Vencedor/empate: nunca pode ser 'losing' durante o jogo (pode sempre mudar)
  // só mostramos 'winning' se o resultado actual já bate com o apostado
  let outcome = 'open';
  if (pick.outcome) {
    const curOutcome = outcomeOf(sA, sB);
    if (curOutcome === pick.outcome) outcome = 'winning';
  }

  // Marcador: verde se já marcou, cinza caso contrário (nunca vermelho — pode
  // ainda marcar a qualquer momento, incluindo após entrar como suplente)
  let scorer = 'open';
  if (pick.scorer && result.scorers && result.scorers.length) {
    const target = normStr(pick.scorer);
    const found = result.scorers.some(s => {
      const n = normStr(s);
      if (n === target) return true;
      const lastA = target.split(' ').pop();
      const lastB = n.split(' ').pop();
      if (lastA && lastA.length > 2 && lastA === lastB) return true;
      if (n.includes(target) || target.includes(n)) return true;
      return false;
    });
    if (found) scorer = 'winning';
  }

  // A qualificar: só se sabe no fim — nunca vermelho ao vivo
  const qualify = 'open';

  return { exact, outcome, scorer, qualify };
}

// Hora de início do jogo, em UTC (as horas guardadas em RAW_MATCHES/RAW_KNOCKOUT
// estão em hora de Lisboa, que em junho/julho é UTC+1 — igual à hora do Reino Unido).
function matchKickoffUTC(match) {
  const [y, m, d] = match.date.split('-').map(Number);
  const [hh, mm] = (match.time || '00:00').split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh - 1, mm);
}

function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-700 text-slate-200',
    amber: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
    teal: 'bg-teal-500/20 text-teal-300 border border-teal-500/40',
    rose: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function PointPill({ label, earned, value }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
        earned ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-500 border border-slate-700'
      }`}
    >
      {earned ? <Check size={12} /> : <X size={12} />} {label} {earned ? `+${value}` : ''}
    </span>
  );
}

// Uma "linha de aposta": título + valor em pontos à direita, no estilo bilhete
// de aposta (ex: "Achraf Hakimi: 2+ Desarmes"), com o estado pendente/certo/errado.
function BetLine({ label, sublabel, status, points, children }) {
  const badgeClass =
    status === 'gold'
      ? 'bg-amber-500/30 text-amber-300 border-amber-400/60'
      : status === 'correct'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
      : status === 'wrong'
      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
      : 'bg-slate-800 text-slate-300 border-slate-700';
  const cardClass =
    status === 'gold'
      ? 'bg-amber-500/10 border-amber-400/50'
      : status === 'correct'
      ? 'bg-emerald-500/5 border-emerald-500/25'
      : status === 'wrong'
      ? 'bg-rose-500/5 border-rose-500/20'
      : 'bg-slate-900 border-slate-700';
  return (
    <div className={`rounded-xl border px-3 py-2.5 mb-2 ${cardClass}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-100 truncate">{label}</p>
          {sublabel && <p className="text-xs text-slate-500 truncate">{sublabel}</p>}
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${badgeClass}`}>
          {(status === 'correct' || status === 'gold') && <Check size={12} />}
          {status === 'wrong' && <X size={12} />}
          {points}
        </span>
      </div>
      {children}
    </div>
  );
}

function MatchCard({ match, pick, result, isAdmin, myName, onSavePick, onSaveResult, otherPicks, knownPlayers, onAdminSavePick }) {
  const displayTeamA = (result && result.teamAName) || match.teamA;
  const displayTeamB = (result && result.teamBName) || match.teamB;
  const isKnockout = match.group === null;

  const [draftPick, setDraftPick] = useState(
    pick || { outcome: '', scoreA: '', scoreB: '', scorer: '', qualifier: '' }
  );
  const [adminOpen, setAdminOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const [draftResult, setDraftResult] = useState(
    result || { scoreA: '', scoreB: '', scoreA90: '', scoreB90: '', scorers: [], live: false, finished: false, teamAName: '', teamBName: '', qualifier: '' }
  );
  const squadOptions = useMemo(
    () => [...(SQUADS[displayTeamA] || []), ...(SQUADS[displayTeamB] || [])],
    [displayTeamA, displayTeamB]
  );
  const [useOtherScorer, setUseOtherScorer] = useState(
    !!(pick && pick.scorer) && !squadOptions.includes(pick.scorer)
  );

  const [pickAdminOpen, setPickAdminOpen] = useState(false);
  const [resultGoalOther, setResultGoalOther] = useState(false);
  const [resultGoalOtherText, setResultGoalOtherText] = useState('');

  function addGoal(name) {
    if (!name || !name.trim()) return;
    setDraftResult((d) => ({ ...d, scorers: [...(d.scorers || []), name.trim()] }));
  }

  function removeGoal(index) {
    setDraftResult((d) => ({ ...d, scorers: (d.scorers || []).filter((_, i) => i !== index) }));
  }

  const [adminPickName, setAdminPickName] = useState('');
  const [useNewPlayerName, setUseNewPlayerName] = useState(false);
  const [adminPickDraft, setAdminPickDraft] = useState({ outcome: '', scoreA: '', scoreB: '', scorer: '', qualifier: '' });
  const [adminScorerOther, setAdminScorerOther] = useState(false);


  useEffect(() => {
    setDraftPick(pick || { outcome: '', scoreA: '', scoreB: '', scorer: '', qualifier: '' });
  }, [pick]);

  useEffect(() => {
    setDraftResult(result || { scoreA: '', scoreB: '', scorers: [], live: false, finished: false, teamAName: '', teamBName: '', qualifier: '' });
  }, [result]);

  const finished = !!(result && result.finished);
  const isLive = !!(result && result.live && !finished);
  const pts = finished ? pointsFor(pick, result) : null;
  const liveStatus = isLive ? liveStatusFor(pick, result) : null;
  const allCorrect = finished && pts &&
    pts.exact > 0 && pts.outcome > 0 && pts.scorer > 0 &&
    (!isKnockout || pts.qualify > 0);

  function updatePick(partial) {
    const next = { ...draftPick, ...partial };
    // Se o resultado exato tiver ambos os golos preenchidos, inferir automaticamente o V/E/D
    const a = next.scoreA !== '' && next.scoreA !== undefined ? Number(next.scoreA) : null;
    const b = next.scoreB !== '' && next.scoreB !== undefined ? Number(next.scoreB) : null;
    if (a !== null && b !== null && !isNaN(a) && !isNaN(b)) {
      next.outcome = a > b ? 'A' : a < b ? 'B' : 'D';
      // Em jogos eliminatórios, infere o qualifier a partir do placar — mas só
      // quando o resultado não é empate (empate = vai a prolongamento, o qualifier
      // tem de ser escolhido manualmente). Se o utilizador já escolheu explicitamente
      // um qualifier diferente do inferido, respeita a escolha manual.
      if (isKnockout) {
        if (a !== b) {
          next.qualifier = a > b ? 'A' : 'B';
        } else if (partial.qualifier === undefined) {
          // empate e não está a mudar o qualifier — preserva o que está
          next.qualifier = next.qualifier || '';
        }
      }
    }
    setDraftPick(next);
    return next;
  }

  function commitPick(partial) {
    const next = updatePick(partial);
    onSavePick(match.id, next);
  }

  function saveResultNow(extra = {}) {
    const payload = {
      scoreA: extra.scoreA !== undefined ? extra.scoreA : draftResult.scoreA,
      scoreB: extra.scoreB !== undefined ? extra.scoreB : draftResult.scoreB,
      scoreA90: extra.scoreA90 !== undefined ? extra.scoreA90 : draftResult.scoreA90 ?? '',
      scoreB90: extra.scoreB90 !== undefined ? extra.scoreB90 : draftResult.scoreB90 ?? '',
      scorers: extra.scorers !== undefined ? extra.scorers : draftResult.scorers || [],
      live: extra.live !== undefined ? extra.live : draftResult.live,
      finished: extra.finished !== undefined ? extra.finished : draftResult.finished,
      teamAName: extra.teamAName !== undefined ? extra.teamAName : draftResult.teamAName || '',
      teamBName: extra.teamBName !== undefined ? extra.teamBName : draftResult.teamBName || '',
      qualifier: extra.qualifier !== undefined ? extra.qualifier : draftResult.qualifier || '',
    };
    setDraftResult(payload);
    onSaveResult(match.id, payload);
  }

  const hasKickedOff = Date.now() >= matchKickoffUTC(match);
  const pickEditable = !finished && !hasKickedOff;

  return (
    <div
      className={`rounded-2xl bg-slate-800 border overflow-hidden ${
        isLive ? 'border-rose-500/70 ring-1 ring-rose-500/40' : 'border-slate-700'
      }`}
    >
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Badge>{match.group ? `Grupo ${match.group}` : match.stage}</Badge>
          <span>
            {formatDate(match.date)}
            {match.time ? ` · ${match.time}` : ''}
          </span>
        </div>
        {isLive ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            {result?.halftime
              ? 'INT.'
              : result?.minute
              ? `${result.minute}${result.injuryTime ? `+${result.injuryTime}` : ''}'`
              : 'AO VIVO'}
          </span>
        ) : (
          finished && <span className="text-xs font-bold text-amber-300">+{pts.total} pts</span>
        )}
      </div>

      <div className="px-4 pb-3 flex items-center justify-center gap-3">
        <span className="flex-1 text-right font-black text-stone-100 text-base">{displayTeamA}</span>
        {finished || isLive ? (
          <span
            className={`px-3 py-1 rounded-lg bg-slate-900 border font-black tabular-nums text-lg ${
              isLive ? 'border-rose-500/60 text-rose-300' : 'border-slate-700 text-amber-300'
            }`}
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            {result.scoreA || '0'} - {result.scoreB || '0'}
          </span>
        ) : (
          <span className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-500 text-sm font-bold">vs</span>
        )}
        <span className="flex-1 text-left font-black text-stone-100 text-base">{displayTeamB}</span>
      </div>

      {(finished || isLive) && result?.scorerDetails?.length > 0 && (
        <div className="px-4 pb-2 flex gap-2">
          {/* Marcadores teamA (lado esquerdo) */}
          <div className="flex-1 flex flex-col items-end gap-0.5">
            {result.scorerDetails.filter(s => s.teamSide === 'A').map((s, i) => (
              <p key={i} className="text-[11px] text-slate-400 text-right">
                {s.ownGoal ? <span className="text-slate-500">(AG) </span> : null}
                {s.name}{s.minute ? ` ${s.minute}` : ''}
              </p>
            ))}
          </div>
          <div className="w-px bg-slate-700 shrink-0" />
          {/* Marcadores teamB (lado direito) */}
          <div className="flex-1 flex flex-col items-start gap-0.5">
            {result.scorerDetails.filter(s => s.teamSide === 'B').map((s, i) => (
              <p key={i} className="text-[11px] text-slate-400">
                {s.minute ? `${s.minute} ` : ''}{s.name}
                {s.ownGoal ? <span className="text-slate-500"> (AG)</span> : null}
              </p>
            ))}
          </div>
        </div>
      )}
      {(finished || isLive) && !result?.scorerDetails?.length && result?.scorers?.length > 0 && (
        <p className="px-4 pb-2 text-[11px] text-slate-400">⚽ {result.scorers.join(', ')}</p>
      )}

      {finished && isKnockout && result?.qualifier && (
        <p className="px-4 pb-2 text-xs font-bold text-teal-400">
          ✅ Qualificado: {result.qualifier === 'A' ? displayTeamA : displayTeamB}
        </p>
      )}

      <div className="border-t border-dashed border-slate-600 px-4 py-3">
        {!pickEditable && (
          <p className={`text-xs mb-2 ${finished ? 'text-slate-500' : 'text-rose-400'}`}>
            {finished
              ? 'Jogo terminado.'
              : `${isLive ? 'Jogo a decorrer' : 'O jogo já começou'} — palpites bloqueados.`}
          </p>
        )}

        <BetLine
          label="Resultado exato"
          sublabel="O placar final certinho"
          status={finished ? (allCorrect ? 'gold' : pts.exact > 0 ? 'correct' : 'wrong') : isLive && liveStatus ? (liveStatus.exact === 'winning' ? 'correct' : liveStatus.exact === 'losing' ? 'wrong' : 'pending') : 'pending'}
          points={finished ? `+${pts.exact}` : '+5 pts'}
        >
          {pickEditable ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={draftPick.scoreA}
                onChange={(e) => updatePick({ scoreA: e.target.value })}
                onBlur={() => commitPick({})}
                className="w-12 text-center rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1"
              />
              <span className="text-slate-500">-</span>
              <input
                type="number"
                min="0"
                value={draftPick.scoreB}
                onChange={(e) => updatePick({ scoreB: e.target.value })}
                onBlur={() => commitPick({})}
                className="w-12 text-center rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1"
              />
            </div>
          ) : (
            <p className="text-sm text-slate-300">
              {pick && pick.scoreA !== '' && pick.scoreB !== '' ? `${pick.scoreA} - ${pick.scoreB}` : 'não escolheste'}
            </p>
          )}
        </BetLine>

        <BetLine
          label="Resultado (V/E/D)"
          sublabel="Vitória, empate ou derrota"
          status={finished ? (allCorrect ? 'gold' : pts.outcome > 0 ? 'correct' : 'wrong') : isLive && liveStatus ? (liveStatus.outcome === 'winning' ? 'correct' : liveStatus.outcome === 'losing' ? 'wrong' : 'pending') : 'pending'}
          points={finished ? `+${pts.outcome}` : '+3 pts'}
        >
          {pickEditable ? (
            <div className="flex gap-2">
              {[
                ['A', displayTeamA],
                ['D', 'Empate'],
                ['B', displayTeamB],
              ].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => commitPick({ outcome: val })}
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold truncate transition ${
                    draftPick.outcome === val
                      ? 'bg-amber-500 text-slate-900'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-300">
              {pick && pick.outcome
                ? pick.outcome === 'A'
                  ? displayTeamA
                  : pick.outcome === 'B'
                  ? displayTeamB
                  : 'Empate'
                : 'não escolheste'}
            </p>
          )}
        </BetLine>

        <BetLine
          label="Marcador"
          sublabel="+1 ponto por cada golo dele"
          status={finished ? (allCorrect ? 'gold' : pts.scorer > 0 ? 'correct' : 'wrong') : isLive && liveStatus ? (liveStatus.scorer === 'winning' ? 'correct' : 'pending') : 'pending'}
          points={finished ? `+${pts.scorer}` : '+1/golo'}
        >
          {pickEditable ? (
            <div className="flex items-center gap-2">
              {useOtherScorer ? (
                <input
                  type="text"
                  autoFocus
                  placeholder="escreve o nome"
                  value={draftPick.scorer}
                  onChange={(e) => updatePick({ scorer: e.target.value })}
                  onBlur={() => commitPick({})}
                  className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1 px-2 text-sm"
                />
              ) : (
                <select
                  value={squadOptions.includes(draftPick.scorer) ? draftPick.scorer : ''}
                  onChange={(e) => {
                    if (e.target.value === '__other__') {
                      setUseOtherScorer(true);
                      commitPick({ scorer: '' });
                    } else {
                      commitPick({ scorer: e.target.value });
                    }
                  }}
                  className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
                >
                  <option value="">escolhe quem marca</option>
                  <optgroup label={displayTeamA}>
                    {(SQUADS[displayTeamA] || []).map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </optgroup>
                  <optgroup label={displayTeamB}>
                    {(SQUADS[displayTeamB] || []).map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </optgroup>
                  <option value="__other__">Outro (escrever nome)</option>
                </select>
              )}
              {useOtherScorer && (
                <button onClick={() => setUseOtherScorer(false)} className="text-xs text-slate-400 underline shrink-0">
                  lista
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-300">{pick && pick.scorer ? pick.scorer : 'não escolheste'}</p>
          )}
        </BetLine>

        {isKnockout && (
          <BetLine
            label="A qualificar"
            sublabel="Qual das duas equipas passa?"
            status={finished ? (pts.qualify > 0 ? (allCorrect ? 'gold' : 'correct') : 'wrong') : 'pending'}
            points={finished ? `+${pts.qualify}` : '+2 pts'}
          >
            {pickEditable ? (
              <div className="flex gap-2">
                {[['A', displayTeamA], ['B', displayTeamB]].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => commitPick({ qualifier: draftPick.qualifier === val ? '' : val })}
                    className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold truncate transition ${
                      draftPick.qualifier === val
                        ? 'bg-teal-500 text-slate-900'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-300">
                {pick && pick.qualifier
                  ? pick.qualifier === 'A' ? displayTeamA : displayTeamB
                  : 'não escolheste'}
              </p>
            )}
          </BetLine>
        )}
      </div>

      <div className="border-t border-slate-700">
        {!hasKickedOff ? (
          <div className="px-4 py-2">
            <p className="text-xs text-slate-500 mb-1">
              🔒 Palpites revelados quando o jogo começar
              {otherPicks.length > 0 && ` · ${otherPicks.length} palpite${otherPicks.length > 1 ? 's' : ''} dado${otherPicks.length > 1 ? 's' : ''}`}
            </p>
            {otherPicks.length > 0 && (
              <p className="text-xs text-slate-600">
                {otherPicks.map(({ name }) => name).join(', ')}
              </p>
            )}
          </div>
        ) : (
          <>
            <button
              onClick={() => setOthersOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-slate-400"
            >
              Palpites da galera ({otherPicks.length})
              {othersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {othersOpen && (
              <div className="px-4 pb-3 flex flex-col gap-1.5">
            {otherPicks.length === 0 && (
              <p className="text-xs text-slate-500">Ainda ninguém palpitou este jogo.</p>
            )}
            {otherPicks.map(({ name, pick: p }) => {
              const ptsOther = finished ? pointsFor(p, result) : null;
              const liveOther = isLive ? liveStatusFor(p, result) : null;
              const liveTotal = liveOther
                ? (liveOther.exact === 'winning' ? 5 : 0) + (liveOther.outcome === 'winning' ? 3 : 0) + (liveOther.scorer === 'winning' ? 1 : 0)
                : 0;
              // Só fica vermelho se o resultado exato já é impossível E o VED também já perdeu
              // (o VED nunca fica losing ao vivo, por isso liveLosing nunca é true — mostra neutro)
              const liveLosing = false;
              return (
                <div key={name} className="flex items-center justify-between text-xs">
                  <span className={`truncate ${name === myName ? 'text-amber-300 font-bold' : 'text-slate-300'}`}>
                    {name}
                  </span>
                  <span className={`truncate ml-2 ${finished ? (ptsOther?.total > 0 ? 'text-emerald-400' : 'text-rose-400') : isLive ? (liveLosing ? 'text-rose-400' : liveTotal > 0 ? 'text-emerald-400' : 'text-slate-400') : 'text-slate-400'}`}>
                    {p.outcome ? (p.outcome === 'A' ? displayTeamA : p.outcome === 'B' ? displayTeamB : 'Empate') : '—'}
                    {p.scoreA !== '' && p.scoreB !== '' ? ` (${p.scoreA}-${p.scoreB})` : ''}
                    {p.scorer ? ` · ${p.scorer}` : ''}
                    {isKnockout && p.qualifier ? ` · Q: ${p.qualifier === 'A' ? displayTeamA : displayTeamB}` : ''}
                    {finished && ptsOther ? ` · +${ptsOther.total}` : ''}
                    {isLive && liveOther ? ` · ${liveTotal > 0 ? `+${liveTotal}` : liveLosing ? '✗' : '~'}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>

      {isAdmin && (
        <div className="border-t border-slate-700 bg-slate-900/60">
          <button
            onClick={() => setAdminOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-amber-300"
          >
            Admin: registar resultado
            {adminOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {adminOpen && (
            <div className="px-4 pb-3 flex flex-col gap-2">
              {isKnockout && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`equipa A (atual: ${displayTeamA})`}
                    defaultValue={result && result.teamAName ? result.teamAName : ''}
                    onBlur={(e) => setDraftResult((d) => ({ ...d, teamAName: e.target.value }))}
                    className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1 px-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder={`equipa B (atual: ${displayTeamB})`}
                    defaultValue={result && result.teamBName ? result.teamBName : ''}
                    onBlur={(e) => setDraftResult((d) => ({ ...d, teamBName: e.target.value }))}
                    className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1 px-2 text-sm"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={draftResult.scoreA}
                  onChange={(e) => setDraftResult((d) => ({ ...d, scoreA: e.target.value }))}
                  className="w-14 text-center rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1"
                />
                <span className="text-slate-500">-</span>
                <input
                  type="number"
                  min="0"
                  value={draftResult.scoreB}
                  onChange={(e) => setDraftResult((d) => ({ ...d, scoreB: e.target.value }))}
                  className="w-14 text-center rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1"
                />
                <span className="text-xs text-slate-500">placar final</span>
              </div>
              {isKnockout && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="—"
                    value={draftResult.scoreA90 ?? ''}
                    onChange={(e) => setDraftResult((d) => ({ ...d, scoreA90: e.target.value }))}
                    className="w-14 text-center rounded-md bg-slate-800 border border-slate-600 text-stone-100 py-1"
                  />
                  <span className="text-slate-500">-</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="—"
                    value={draftResult.scoreB90 ?? ''}
                    onChange={(e) => setDraftResult((d) => ({ ...d, scoreB90: e.target.value }))}
                    className="w-14 text-center rounded-md bg-slate-800 border border-slate-600 text-stone-100 py-1"
                  />
                  <span className="text-xs text-slate-500">90 min (V/E/D)</span>
                </div>
              )}

              {(draftResult.scorers || []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {draftResult.scorers.map((s, i) => (
                    <span key={`${s}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-stone-200">
                      {s}
                      <button onClick={() => removeGoal(i)} className="text-slate-500 hover:text-rose-400">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                {resultGoalOther ? (
                  <>
                    <input
                      type="text"
                      autoFocus
                      placeholder="nome de quem marcou"
                      value={resultGoalOtherText}
                      onChange={(e) => setResultGoalOtherText(e.target.value)}
                      className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
                    />
                    <button
                      onClick={() => {
                        addGoal(resultGoalOtherText);
                        setResultGoalOtherText('');
                      }}
                      className="rounded-md bg-slate-700 text-stone-100 text-xs font-bold px-2 py-1.5 shrink-0"
                    >
                      <Plus size={14} />
                    </button>
                    <button onClick={() => setResultGoalOther(false)} className="text-xs text-slate-400 underline shrink-0">
                      lista
                    </button>
                  </>
                ) : (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value === '__other__') setResultGoalOther(true);
                      else if (e.target.value) addGoal(e.target.value);
                    }}
                    className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
                  >
                    <option value="">+ adicionar golo de...</option>
                    <optgroup label={displayTeamA}>
                      {(SQUADS[displayTeamA] || []).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </optgroup>
                    <optgroup label={displayTeamB}>
                      {(SQUADS[displayTeamB] || []).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </optgroup>
                    <option value="__other__">Outro (escrever nome)</option>
                  </select>
                )}
              </div>
              {isKnockout && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 shrink-0">Quem passa:</span>
                  {[['A', displayTeamA], ['B', displayTeamB]].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setDraftResult((d) => ({ ...d, qualifier: d.qualifier === val ? '' : val }))}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold truncate transition ${
                        draftResult.qualifier === val ? 'bg-teal-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-rose-300">
                    <input
                      type="checkbox"
                      checked={!!draftResult.live}
                      onChange={(e) => setDraftResult((d) => ({ ...d, live: e.target.checked }))}
                    />
                    Ao vivo
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={!!draftResult.finished}
                      onChange={(e) => setDraftResult((d) => ({ ...d, finished: e.target.checked }))}
                    />
                    Terminado
                  </label>
                </div>
                <button
                  onClick={() =>
                    saveResultNow({
                      scoreA: draftResult.scoreA,
                      scoreB: draftResult.scoreB,
                      scorers: draftResult.scorers || [],
                      live: draftResult.live,
                      finished: draftResult.finished,
                      teamAName: draftResult.teamAName,
                      teamBName: draftResult.teamBName,
                      qualifier: draftResult.qualifier || '',
                    })
                  }
                  className="rounded-lg bg-amber-500 text-slate-900 font-bold text-xs px-3 py-1.5"
                >
                  Guardar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="border-t border-slate-700 bg-slate-900/60">
          <button
            onClick={() => setPickAdminOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-teal-300"
          >
            Admin: inserir palpite de alguém
            {pickAdminOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {pickAdminOpen && (
            <div className="px-4 pb-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {useNewPlayerName ? (
                  <input
                    type="text"
                    autoFocus
                    placeholder="nome do jogador"
                    value={adminPickName}
                    onChange={(e) => setAdminPickName(e.target.value)}
                    className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
                  />
                ) : (
                  <select
                    value={adminPickName}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setUseNewPlayerName(true);
                        setAdminPickName('');
                        setAdminPickDraft({ outcome: '', scoreA: '', scoreB: '', scorer: '', qualifier: '' });
                      } else {
                        setAdminPickName(e.target.value);
                        const existing = (otherPicks || []).find((p) => p.name === e.target.value);
                        if (existing && existing.pick) {
                          const p = existing.pick;
                          setAdminPickDraft({
                            outcome: p.outcome || '',
                            scoreA: p.scoreA ?? '',
                            scoreB: p.scoreB ?? '',
                            scorer: p.scorer || '',
                            qualifier: p.qualifier || '',
                          });
                          setAdminScorerOther(!!p.scorer && !squadOptions.includes(p.scorer));
                        } else {
                          setAdminPickDraft({ outcome: '', scoreA: '', scoreB: '', scorer: '', qualifier: '' });
                          setAdminScorerOther(false);
                        }
                      }
                    }}
                    className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
                  >
                    <option value="">escolhe o jogador (mostra o palpite atual p/ corrigir)</option>
                    {(knownPlayers || []).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                    <option value="__new__">+ Novo jogador</option>
                  </select>
                )}
                {useNewPlayerName && (
                  <button onClick={() => { setUseNewPlayerName(false); setAdminPickName(''); }} className="text-xs text-slate-400 underline shrink-0">
                    lista
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {[
                  ['A', displayTeamA],
                  ['D', 'Empate'],
                  ['B', displayTeamB],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setAdminPickDraft((d) => ({ ...d, outcome: val }))}
                    className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold truncate transition ${
                      adminPickDraft.outcome === val ? 'bg-teal-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {isKnockout && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 shrink-0 w-16">A qualif.</span>
                  {[['A', displayTeamA], ['B', displayTeamB]].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setAdminPickDraft((d) => ({ ...d, qualifier: d.qualifier === val ? '' : val }))}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold truncate transition ${
                        adminPickDraft.qualifier === val ? 'bg-teal-500 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-16 truncate">Resultado</span>
                <input
                  type="number"
                  min="0"
                  value={adminPickDraft.scoreA}
                  onChange={(e) => setAdminPickDraft((d) => {
                    const next = { ...d, scoreA: e.target.value };
                    const a = Number(next.scoreA), b = Number(next.scoreB);
                    if (next.scoreA !== '' && next.scoreB !== '' && !isNaN(a) && !isNaN(b)) {
                      next.outcome = a > b ? 'A' : a < b ? 'B' : 'D';
                      if (isKnockout && a !== b) next.qualifier = a > b ? 'A' : 'B';
                    }
                    return next;
                  })}
                  className="w-12 text-center rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1"
                />
                <span className="text-slate-500">-</span>
                <input
                  type="number"
                  min="0"
                  value={adminPickDraft.scoreB}
                  onChange={(e) => setAdminPickDraft((d) => {
                    const next = { ...d, scoreB: e.target.value };
                    const a = Number(next.scoreA), b = Number(next.scoreB);
                    if (next.scoreA !== '' && next.scoreB !== '' && !isNaN(a) && !isNaN(b)) {
                      next.outcome = a > b ? 'A' : a < b ? 'B' : 'D';
                      if (isKnockout && a !== b) next.qualifier = a > b ? 'A' : 'B';
                    }
                    return next;
                  })}
                  className="w-12 text-center rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-16 truncate">Marcador</span>
                {adminScorerOther ? (
                  <input
                    type="text"
                    placeholder="escreve o nome"
                    value={adminPickDraft.scorer}
                    onChange={(e) => setAdminPickDraft((d) => ({ ...d, scorer: e.target.value }))}
                    className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1 px-2 text-sm"
                  />
                ) : (
                  <select
                    value={squadOptions.includes(adminPickDraft.scorer) ? adminPickDraft.scorer : ''}
                    onChange={(e) => {
                      if (e.target.value === '__other__') {
                        setAdminScorerOther(true);
                        setAdminPickDraft((d) => ({ ...d, scorer: '' }));
                      } else {
                        setAdminPickDraft((d) => ({ ...d, scorer: e.target.value }));
                      }
                    }}
                    className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
                  >
                    <option value="">escolhe quem marca</option>
                    <optgroup label={displayTeamA}>
                      {(SQUADS[displayTeamA] || []).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </optgroup>
                    <optgroup label={displayTeamB}>
                      {(SQUADS[displayTeamB] || []).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </optgroup>
                    <option value="__other__">Outro (escrever nome)</option>
                  </select>
                )}
                {adminScorerOther && (
                  <button onClick={() => setAdminScorerOther(false)} className="text-xs text-slate-400 underline shrink-0">
                    lista
                  </button>
                )}
              </div>
              <button
                onClick={async () => {
                  if (!adminPickName.trim()) return;
                  await onAdminSavePick(adminPickName.trim(), match.id, adminPickDraft);
                  setAdminPickDraft({ outcome: '', scoreA: '', scoreB: '', scorer: '', qualifier: '' });
                  setAdminPickName('');
                  setUseNewPlayerName(false);
                }}
                className="rounded-lg bg-teal-500 text-slate-900 font-bold text-xs px-3 py-1.5 self-end"
              >
                Guardar palpite
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddMatchForm({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [stageLabel, setStageLabel] = useState('Oitavos de Final');
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [date, setDate] = useState('2026-06-28');

  function submit() {
    if (!teamA.trim() || !teamB.trim()) return;
    onAdd({
      id: `extra-${Date.now()}`,
      group: null,
      stage: stageLabel,
      matchday: null,
      date,
      teamA: teamA.trim(),
      teamB: teamB.trim(),
    });
    setTeamA('');
    setTeamB('');
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-600 text-slate-400 py-3 text-sm font-semibold hover:border-amber-500 hover:text-amber-300"
      >
        <Plus size={16} /> Adicionar jogo da fase eliminatória
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4 flex flex-col gap-2">
      <select
        value={stageLabel}
        onChange={(e) => setStageLabel(e.target.value)}
        className="rounded-md bg-slate-900 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
      >
        {['Oitavos de Final', 'Ronda de 16', 'Quartos de Final', 'Meias-Finais', '3º Lugar', 'Final'].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          value={teamA}
          onChange={(e) => setTeamA(e.target.value)}
          placeholder="Equipa A"
          className="flex-1 rounded-md bg-slate-900 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
        />
        <input
          value={teamB}
          onChange={(e) => setTeamB(e.target.value)}
          placeholder="Equipa B"
          className="flex-1 rounded-md bg-slate-900 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
        />
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-md bg-slate-900 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
      />
      <div className="flex gap-2 justify-end">
        <button onClick={() => setOpen(false)} className="text-xs text-slate-400 px-3 py-1.5">
          Cancelar
        </button>
        <button onClick={submit} className="rounded-lg bg-amber-500 text-slate-900 font-bold text-xs px-3 py-1.5">
          Adicionar
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [stage, setStage] = useState('loading');
  const [myName, setMyName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState('proximos');
  const [results, setResults] = useState({});
  const [extraMatches, setExtraMatches] = useState([]);
  const [myPicks, setMyPicks] = useState({});
  const [allPicks, setAllPicks] = useState([]);
  const [filterGroup, setFilterGroup] = useState('Todos');
  const [proximosDays, setProximosDays] = useState(3);
  const [lbSort, setLbSort] = useState('total');
  const [historyPlayer, setHistoryPlayer] = useState(null);
  const [comparePlayer, setComparePlayer] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const n = await storage.get('myName', false);
        if (n && n.value) setMyName(n.value);
      } catch (e) {}
      try {
        const a = await storage.get('adminUnlocked', false);
        if (a && a.value === 'true') setIsAdmin(true);
      } catch (e) {}
      setStage('checked');
    })();
  }, []);

  useEffect(() => {
    if (stage === 'checked') setStage(myName ? 'app' : 'name-entry');
  }, [stage, myName]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }, []);

  const loadShared = useCallback(async () => {
    try {
      const r = await storage.get('results', true);
      setResults(r && r.value ? JSON.parse(r.value) : {});
    } catch (e) {
      setResults({});
    }
    try {
      const ex = await storage.get('extraMatches', true);
      setExtraMatches(ex && ex.value ? JSON.parse(ex.value) : []);
    } catch (e) {
      setExtraMatches([]);
    }
  }, []);

  const loadMyPicks = useCallback(async (name) => {
    if (!name) return;
    try {
      const p = await storage.get(`picks_${slug(name)}`, true);
      if (p && p.value) setMyPicks(JSON.parse(p.value).matches || {});
      else setMyPicks({});
    } catch (e) {
      setMyPicks({});
    }
  }, []);

  const loadAllPicks = useCallback(async () => {
    try {
      const list = await storage.list('picks_', true);
      const keys = (list && list.keys) || [];
      const rows = [];
      for (const k of keys) {
        try {
          const v = await storage.get(k, true);
          if (v && v.value) {
            const parsed = JSON.parse(v.value);
            rows.push({ name: parsed.name || k, matches: parsed.matches || {} });
          }
        } catch (e) {}
      }
      setAllPicks(rows);
    } catch (e) {
      setAllPicks([]);
    }
  }, []);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const allMatches = useMemo(() => {
    return [...BASE_MATCHES, ...KNOCKOUT_MATCHES, ...extraMatches]
      .filter((m) => m.date >= todayStr)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  }, [extraMatches, todayStr]);

  const allMatchesEver = useMemo(() => {
    return [...BASE_MATCHES, ...KNOCKOUT_MATCHES, ...extraMatches]
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  }, [extraMatches]);

  function buildPlayerHistory(name) {
    const playerData = allPicks.find((p) => p.name === name);
    const picks = playerData ? playerData.matches : {};
    return allMatchesEver
      .filter((m) => results[m.id] && results[m.id].finished)
      .map((m) => {
        const pick = picks[m.id];
        const result = results[m.id];
        const pts = pointsFor(pick, result);
        return { match: m, pick, result, pts };
      })
      .reverse();
  }

  const leaderboard = useMemo(() => {
    const rows = allPicks.map(({ name, matches }) => {
      let total = 0, exactCount = 0, outcomeCount = 0, scorerCount = 0, scorerPoints = 0, plenoCount = 0, qualifyCount = 0;
      for (const m of allMatchesEver) {
        const pts = pointsFor(matches[m.id], results[m.id]);
        total += pts.total;
        if (pts.exact) exactCount++;
        if (pts.outcome) outcomeCount++;
        if (pts.scorer) { scorerCount++; scorerPoints += pts.scorer; }
        if (pts.exact && pts.outcome && pts.scorer) plenoCount++;
        if (pts.qualify) qualifyCount++;
      }
      return { name, total, exactCount, outcomeCount, scorerCount, scorerPoints, plenoCount, qualifyCount };
    });
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return rows;
  }, [allPicks, allMatchesEver, results]);

  const picksByMatch = useMemo(() => {
    const map = {};
    for (const { name, matches } of allPicks) {
      for (const [matchId, p] of Object.entries(matches)) {
        if (!p || !p.outcome) continue;
        (map[matchId] = map[matchId] || []).push({ name, pick: p });
      }
    }
    return map;
  }, [allPicks]);

  const knownPlayers = useMemo(() => {
    const names = new Set(allPicks.map((p) => p.name));
    if (myName) names.add(myName);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [allPicks, myName]);

  const liveMatches = useMemo(() => {
    return allMatches.filter((m) => {
      const r = results[m.id];
      return r && r.live && !r.finished;
    });
  }, [allMatches, results]);

  const terminadosMatches = useMemo(() => {
    return allMatchesEver.filter((m) => results[m.id] && results[m.id].finished).slice().reverse();
  }, [allMatchesEver, results]);

  const proximosLimitDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + proximosDays);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }, [proximosDays]);

  const proximosGroupedByDate = useMemo(() => {
    let filtered = allMatches.filter((m) => !(results[m.id] && results[m.id].finished) && m.date <= proximosLimitDate);
    if (filterGroup !== 'Todos') filtered = filtered.filter((m) => m.group === filterGroup || m.group === null);
    const map = {};
    for (const m of filtered) (map[m.date] = map[m.date] || []).push(m);
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allMatches, results, proximosLimitDate, filterGroup]);

  useEffect(() => {
    if (stage === 'app') {
      loadShared();
      loadMyPicks(myName);
      loadAllPicks();
    }
  }, [stage, myName, loadShared, loadMyPicks, loadAllPicks]);

  // Ao abrir a app, vai buscar marcadores em falta à ESPN para todos
  // os jogos terminados com golos mas sem marcadores guardados.
  // Usa localStorage para não repetir mais de uma vez por hora.
  useEffect(() => {
    if (stage !== 'app') return;
    (async () => {
      // Throttle: não corre se já correu na última hora
      const lastRun = localStorage.getItem('espn_scorers_sync');
      if (lastRun && Date.now() - Number(lastRun) < 60 * 60 * 1000) return;

      const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
      const stop = new Set(['do','da','de','e','and','of','the']);
      const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
      const words = s => norm(s).split(/\s+/).filter(w => w && !stop.has(w));
      const teamsMatch = (a, b) => {
        if (norm(a) === norm(b)) return true;
        const wa = words(a), wb = words(b);
        const [sh, lo] = wa.length <= wb.length ? [wa,wb] : [wb,wa];
        return sh.every(w => lo.some(w2 => w2===w || w2.includes(w) || w.includes(w2)));
      };
      const TEAM_MAP = {
        'México':'Mexico','África do Sul':'South Africa','Coreia do Sul':'South Korea',
        'Chéquia':'Czech Republic','Canadá':'Canada','Bósnia e Herzegovina':'Bosnia',
        'Catar':'Qatar','Suíça':'Switzerland','Brasil':'Brazil','Marrocos':'Morocco',
        'Escócia':'Scotland','Estados Unidos':'USA','Alemanha':'Germany',
        'Curaçao':'Curacao','Costa do Marfim':'Ivory Coast','Equador':'Ecuador',
        'Holanda':'Netherlands','Suécia':'Sweden','Tunísia':'Tunisia',
        'Bélgica':'Belgium','Egito':'Egypt','Irão':'Iran','Nova Zelândia':'New Zealand',
        'Espanha':'Spain','Cabo Verde':'Cape Verde','Arábia Saudita':'Saudi Arabia',
        'Uruguai':'Uruguay','França':'France','Noruega':'Norway',
        'Argentina':'Argentina','Argélia':'Algeria','Áustria':'Austria',
        'Jordânia':'Jordan','Portugal':'Portugal','Colômbia':'Colombia',
        'Inglaterra':'England','Croácia':'Croatia','Gana':'Ghana',
        'Panamá':'Panama','Japão':'Japan','Iraque':'Iraq',
        'Senegal':'Senegal','Haiti':'Haiti','Usbequistão':'Uzbekistan',
        'RD Congo':'DR Congo','Austrália':'Australia','Turquia':'Turkey','Paraguai':'Paraguay',
      };

      let current = {};
      try {
        const r = await storage.get('results', true);
        current = r && r.value ? JSON.parse(r.value) : {};
      } catch (e) { return; }

      // Apenas jogos terminados com golos mas sem marcadores
      const allM = [...BASE_MATCHES, ...KNOCKOUT_MATCHES];
      const needScorers = allM.filter(m => {
        const r = current[m.id];
        if (!r || !r.finished) return false;
        const goals = (Number(r.scoreA)||0) + (Number(r.scoreB)||0);
        return goals > 0 && (!r.scorers || r.scorers.length === 0);
      });

      // Marca o timestamp mesmo que não haja nada a fazer
      localStorage.setItem('espn_scorers_sync', String(Date.now()));

      if (needScorers.length === 0) return;

      try {
        const res = await fetch(`${ESPN_BASE}/scoreboard?limit=200&dates=20260611-20260719`);
        if (!res.ok) return;
        const data = await res.json();
        const events = data.events || [];

        let updated = false;
        for (const match of needScorers) {
          const rawA = TEAM_MAP[match.teamA] ? match.teamA : (current[match.id]?.teamAName || match.teamA);
          const rawB = TEAM_MAP[match.teamB] ? match.teamB : (current[match.id]?.teamBName || match.teamB);
          const a = TEAM_MAP[rawA] || rawA;
          const b = TEAM_MAP[rawB] || rawB;
          const ev = events.find(e => {
            const comp = e.competitions?.[0];
            const home = comp?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName || '';
            const away = comp?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName || '';
            return (teamsMatch(a,home) && teamsMatch(b,away)) || (teamsMatch(b,home) && teamsMatch(a,away));
          });
          if (!ev) continue;

          const details = ev.competitions?.[0]?.details || [];
          const scorers = details
            .filter(d => {
              const t = (d.type?.text || d.type?.abbreviation || '').toLowerCase();
              return t.includes('goal') && !t.includes('disallowed') && !t.includes('missed');
            })
            .map(d => d.athletesInvolved?.[0]?.displayName || '')
            .filter(Boolean);

          if (scorers.length > 0) {
            current = { ...current, [match.id]: { ...current[match.id], scorers } };
            updated = true;
          }
        }

        if (updated) {
          await storage.set('results', JSON.stringify(current), true);
          setResults(current);
        }
      } catch (e) {}
    })();
  }, [stage]);

  useEffect(() => {
    if (stage !== 'app') return;
    const id = setInterval(() => {
      loadShared();
      loadAllPicks();
    }, 10000);
    return () => clearInterval(id);
  }, [stage, loadShared, loadAllPicks]);

  // Polling da ESPN a cada 30s — só corre quando há jogos ao vivo ou iminentes.
  // A ESPN dá placar + minuto + marcadores em tempo real.
  useEffect(() => {
    if (stage !== 'app') return;
    let cancelled = false;
    let timeoutId = null;
    const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

    const stop = new Set(['do','da','de','e','and','of','the']);
    const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const words = s => norm(s).split(/\s+/).filter(w => w && !stop.has(w));
    const teamsMatch = (a, b) => {
      if (norm(a) === norm(b)) return true;
      const wa = words(a), wb = words(b);
      const [sh, lo] = wa.length <= wb.length ? [wa,wb] : [wb,wa];
      return sh.every(w => lo.some(w2 => w2===w || w2.includes(w) || w.includes(w2)));
    };
    const TEAM_MAP = {
      'México':'Mexico','África do Sul':'South Africa','Coreia do Sul':'South Korea',
      'Chéquia':'Czech Republic','Canadá':'Canada','Bósnia e Herzegovina':'Bosnia',
      'Catar':'Qatar','Suíça':'Switzerland','Brasil':'Brazil','Marrocos':'Morocco',
      'Escócia':'Scotland','Estados Unidos':'USA','Alemanha':'Germany',
      'Curaçao':'Curacao','Costa do Marfim':'Ivory Coast','Equador':'Ecuador',
      'Holanda':'Netherlands','Suécia':'Sweden','Tunísia':'Tunisia',
      'Bélgica':'Belgium','Egito':'Egypt','Irão':'Iran','Nova Zelândia':'New Zealand',
      'Espanha':'Spain','Cabo Verde':'Cape Verde','Arábia Saudita':'Saudi Arabia',
      'Uruguai':'Uruguay','França':'France','Noruega':'Norway',
      'Argentina':'Argentina','Argélia':'Algeria','Áustria':'Austria',
      'Jordânia':'Jordan','Portugal':'Portugal','Colômbia':'Colombia',
      'Inglaterra':'England','Croácia':'Croatia','Gana':'Ghana',
      'Panamá':'Panama','Japão':'Japan','Iraque':'Iraq',
      'Senegal':'Senegal','Haiti':'Haiti','Usbequistão':'Uzbekistan',
      'RD Congo':'DR Congo','Austrália':'Australia','Turquia':'Turkey','Paraguai':'Paraguay',
    };

    function matchKickoffUTC(match) {
      const [h, min] = (match.time || '00:00').split(':').map(Number);
      const d = new Date(`${match.date}T00:00:00Z`);
      d.setUTCHours(h - 1, min, 0, 0); // Lisboa UTC+1 -> UTC
      return d.getTime();
    }

    // Extrai marcadores directamente do evento ESPN — usa displayName (nome
    // completo) em vez dos nomes abreviados que a API-Football devolvia.
    function scorersFromEspnEvent(ev) {
      const comp = ev.competitions?.[0];
      const details = comp?.details || [];
      const homeId = comp?.competitors?.find(c => c.homeAway === 'home')?.team?.id;
      return details
        .filter(d => {
          const t = (d.type?.text || d.type?.abbreviation || '').toLowerCase();
          return t.includes('goal') && !t.includes('disallowed') && !t.includes('missed');
        })
        .map(d => ({
          name: d.athletesInvolved?.[0]?.displayName || '',
          minute: d.clock?.displayValue || null,
          ownGoal: d.ownGoal === true,
          // 'home' se o golo foi marcado pela equipa da casa (homeAway='home')
          // Na app, 'home' = teamA (se não swapped) ou teamB (se swapped)
          teamId: d.team?.id || null,
          isHome: d.team?.id === homeId,
        }))
        .filter(s => s.name);
    }

    async function poll() {
      if (cancelled) return;
      const allM = [...BASE_MATCHES, ...KNOCKOUT_MATCHES];
      const now = Date.now();

      // Verifica se há jogos ao vivo ou a começar em breve (<15min).
      // Janela de 200min cobre 90min regulares + 30min prorrogação + penáltis + buffer.
      // Também inclui qualquer jogo ainda marcado como live no Supabase (para não
      // ficar preso se o prolongamento ultrapassar a janela de tempo).
      let current = {};
      try {
        const s = await storage.get('results', true);
        current = s && s.value ? JSON.parse(s.value) : {};
      } catch (e) {}

      const hasActive = allM.some(m => {
        const ko = matchKickoffUTC(m);
        const inWindow = now >= ko - 15 * 60 * 1000 && now <= ko + 240 * 60 * 1000;
        const stillLive = current[m.id]?.live === true;
        // Também inclui jogos que já deviam ter começado mas não têm resultado nenhum
        const startedNoResult = now >= ko && now <= ko + 240 * 60 * 1000 && !current[m.id]?.finished;
        return inWindow || stillLive || startedNoResult;
      });

      if (!hasActive) {
        // Nenhum jogo activo — acorda 10min antes do próximo
        const nextKo = allM
          .map(m => matchKickoffUTC(m))
          .filter(t => t > now)
          .sort((a,b) => a - b)[0];
        const delay = nextKo ? Math.max(0, nextKo - now - 10 * 60 * 1000) : 3 * 60 * 60 * 1000;
        if (!cancelled) timeoutId = setTimeout(poll, delay);
        return;
      }

      try {
        const r = await fetch(`${ESPN_BASE}/scoreboard?limit=200&dates=20260611-20260719`);
        if (!r.ok || cancelled) { timeoutId = setTimeout(poll, 30000); return; }
        const data = await r.json();
        const events = data.events || [];

        let changed = false;
        const toSave = { ...current };

        for (const m of allM) {
          const ko = matchKickoffUTC(m);
          const inWindow = now >= ko - 15 * 60 * 1000 && now <= ko + 240 * 60 * 1000;
          const stillLive = current[m.id]?.live === true;
          const startedNoResult = now >= ko && now <= ko + 240 * 60 * 1000 && !current[m.id]?.finished;
          if (!inWindow && !stillLive && !startedNoResult) continue;

          const rawA = TEAM_MAP[m.teamA] ? m.teamA : (current[m.id]?.teamAName || m.teamA);
          const rawB = TEAM_MAP[m.teamB] ? m.teamB : (current[m.id]?.teamBName || m.teamB);
          const a = TEAM_MAP[rawA] || rawA;
          const b = TEAM_MAP[rawB] || rawB;
          const ev = events.find(e => {
            const comp = e.competitions?.[0];
            const home = comp?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName || '';
            const away = comp?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName || '';
            return (teamsMatch(a,home) && teamsMatch(b,away)) || (teamsMatch(b,home) && teamsMatch(a,away));
          });
          if (!ev) continue;

          const comp = ev.competitions?.[0];
          const status = comp?.status || {};
          const state = status.type?.state;
          const statusName = (status.type?.name || '').toUpperCase();
          const homeComp = comp?.competitors?.find(c => c.homeAway === 'home');
          const awayComp = comp?.competitors?.find(c => c.homeAway === 'away');

          // Garante que homeComp corresponde a teamA
          const swapped = teamsMatch(b, homeComp?.team?.displayName || '');
          const scoreA = swapped ? awayComp?.score : homeComp?.score;
          const scoreB = swapped ? homeComp?.score : awayComp?.score;

          const live = state === 'in';
          const finished = state === 'post';
          const halftime = statusName === 'STATUS_HALFTIME';
          const minuteNum = status.elapsed ?? null;
          const minute = halftime ? null : (minuteNum != null ? String(minuteNum) : null);

          // Qualifier: quem avançou (só relevante em jogos eliminatórios).
          // A ESPN marca o competidor vencedor com winner: true quando o jogo termina.
          let qualifier = existing.qualifier || '';
          if (finished && !qualifier) {
            const winnerComp = comp?.competitors?.find(c => c.winner === true);
            if (winnerComp) {
              const isWinnerHome = winnerComp.homeAway === 'home';
              // Se swapped, home na ESPN = teamB na app
              qualifier = swapped
                ? (isWinnerHome ? 'B' : 'A')
                : (isWinnerHome ? 'A' : 'B');
            }
          }

          const existing = toSave[m.id] || {};
          const prevGoals = (Number(existing.scoreA)||0) + (Number(existing.scoreB)||0);
          const nowGoals = (Number(scoreA)||0) + (Number(scoreB)||0);
          const goalChanged = nowGoals !== prevGoals; // golo novo ou anulado
          const justFinished = finished && (!existing.finished);

          // Marcadores: tenta ESPN primeiro (details[]) — só tem dados ao vivo.
          // Se vazio e houve golo ou o jogo acabou, chama API-Football (1 vez).
          const espnScorers = scorersFromEspnEvent(ev);

          // scorerDetails: lista rica com minuto, lado, auto-golo (para display)
          // scorers: só nomes, excluindo auto-golos (para cálculo de pontos)
          let scorerDetails = [];
          let scorers = existing.scorers || [];

          if (espnScorers.length > 0) {
            // Ajusta isHome conforme swap (se swapped, isHome na ESPN = teamB na app)
            scorerDetails = espnScorers.map(s => ({
              ...s,
              teamSide: swapped ? (s.isHome ? 'B' : 'A') : (s.isHome ? 'A' : 'B'),
            }));
            // Para pontos: só nomes não-autogolos
            scorers = scorerDetails.filter(s => !s.ownGoal).map(s => s.name);
          } else if (goalChanged || justFinished) {
            try {
              const apiKey = 'e8134025bc279c122c4863d841fc2edb';
              const apiBase = 'https://v3.football.api-sports.io';
              let fid = existing._fixtureId;
              if (!fid) {
                const r1 = await fetch(`${apiBase}/fixtures?date=${m.date}`, {
                  headers: { 'x-apisports-key': apiKey }
                });
                const d1 = await r1.json();
                if (!d1.errors || Object.keys(d1.errors).length === 0) {
                  const fixtures = (d1.response || []).filter(f => f.league?.id === 1);
                  const found = fixtures.find(f => {
                    const h = f.teams?.home?.name || '';
                    const aw = f.teams?.away?.name || '';
                    return (teamsMatch(a,h) && teamsMatch(b,aw)) || (teamsMatch(b,h) && teamsMatch(a,aw));
                  });
                  fid = found?.fixture?.id || null;
                }
              }
              if (fid) {
                const r2 = await fetch(`${apiBase}/fixtures?id=${fid}`, {
                  headers: { 'x-apisports-key': apiKey }
                });
                const d2 = await r2.json();
                const full = (d2.response || [])[0];
                if (full) {
                  const homeTeamId = full.teams?.home?.id;
                  const apiEvents = (full.events || [])
                    .filter(ev => ev.type === 'Goal' && ev.detail !== 'Missed Penalty');
                  scorerDetails = apiEvents.map(ev => ({
                    name: ev.player?.name || '',
                    minute: ev.time?.elapsed ? `${ev.time.elapsed}'` : null,
                    ownGoal: ev.detail === 'Own Goal',
                    isHome: ev.team?.id === homeTeamId,
                    teamSide: swapped
                      ? (ev.team?.id === homeTeamId ? 'B' : 'A')
                      : (ev.team?.id === homeTeamId ? 'A' : 'B'),
                  })).filter(s => s.name);
                  scorers = scorerDetails.filter(s => !s.ownGoal).map(s => s.name);
                  toSave[m.id] = { ...(toSave[m.id] || existing), _fixtureId: fid };
                }
              }
            } catch (e) { /* segue sem marcadores se falhar */ }
          } else {
            // sem novidades — preserva o que já estava
            scorerDetails = existing.scorerDetails || [];
          }

          const updated = {
            ...existing,
            scoreA: scoreA ?? existing.scoreA ?? '',
            scoreB: scoreB ?? existing.scoreB ?? '',
            live: live && !finished,
            finished: finished || existing.finished || false,
            halftime,
            minute,
            scorers,
            scorerDetails: scorerDetails.length > 0 ? scorerDetails : (existing.scorerDetails || []),
            qualifier,
          };

          const diff =
            updated.scoreA !== existing.scoreA ||
            updated.scoreB !== existing.scoreB ||
            updated.live !== existing.live ||
            updated.finished !== existing.finished ||
            updated.halftime !== existing.halftime ||
            updated.minute !== existing.minute ||
            updated.qualifier !== existing.qualifier ||
            JSON.stringify(updated.scorers) !== JSON.stringify(existing.scorers);

          if (diff) { toSave[m.id] = updated; changed = true; }
        }

        if (changed && !cancelled) {
          await storage.set('results', JSON.stringify(toSave), true);
          setResults(toSave);
        }
      } catch (e) {}

      if (!cancelled) timeoutId = setTimeout(poll, 30000);
    }

    poll();
    return () => { cancelled = true; if (timeoutId) clearTimeout(timeoutId); };
  }, [stage]);

  async function handleNameSubmit(e) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setMyName(trimmed);
    try {
      await storage.set('myName', trimmed, false);
    } catch (e) {}
    setStage('app');
  }

  async function handlePinSubmit() {
    if (pinInput === ADMIN_PIN) {
      setIsAdmin(true);
      setPinInput('');
      setPinOpen(false);
      try {
        await storage.set('adminUnlocked', 'true', false);
      } catch (e) {}
      showToast('Modo admin ativado');
    } else {
      showToast('Código incorreto');
    }
  }

  async function lockAdmin() {
    setIsAdmin(false);
    try {
      await storage.set('adminUnlocked', 'false', false);
    } catch (e) {}
  }

  async function savePick(matchId, pickPartial) {
    const next = { ...myPicks, [matchId]: { ...(myPicks[matchId] || {}), ...pickPartial } };
    setMyPicks(next);
    setAllPicks((prev) => {
      const others = prev.filter((p) => p.name !== myName);
      return [...others, { name: myName, matches: next }];
    });
    try {
      await storage.set(`picks_${slug(myName)}`, JSON.stringify({ name: myName, matches: next }), true);
    } catch (e) {
      showToast('Erro ao guardar palpite');
    }
  }

  async function saveResult(matchId, payload) {
    const next = { ...results, [matchId]: payload };
    setResults(next);
    try {
      await storage.set('results', JSON.stringify(next), true);
      showToast('Resultado guardado');
    } catch (e) {
      showToast('Erro ao guardar resultado');
    }
  }

  async function adminSavePick(playerName, matchId, pickPartial) {
    const trimmed = playerName.trim();
    if (!trimmed) return;
    try {
      let current = { name: trimmed, matches: {} };
      try {
        const existing = await storage.get(`picks_${slug(trimmed)}`, true);
        if (existing && existing.value) current = JSON.parse(existing.value);
      } catch (e) {}
      const nextMatches = { ...current.matches, [matchId]: { ...(current.matches[matchId] || {}), ...pickPartial } };
      await storage.set(`picks_${slug(trimmed)}`, JSON.stringify({ name: trimmed, matches: nextMatches }), true);
      setAllPicks((prev) => {
        const others = prev.filter((p) => p.name !== trimmed);
        return [...others, { name: trimmed, matches: nextMatches }];
      });
      if (trimmed === myName) setMyPicks(nextMatches);
      showToast(`Palpite de ${trimmed} guardado`);
    } catch (e) {
      showToast('Erro ao guardar palpite');
    }
  }

  async function addExtraMatch(match) {
    const next = [...extraMatches, match];
    setExtraMatches(next);
    try {
      await storage.set('extraMatches', JSON.stringify(next), true);
    } catch (e) {}
  }

  const myTotal = leaderboard.find((r) => r.name === myName)?.total ?? 0;
  const myRank = leaderboard.findIndex((r) => r.name === myName) + 1;

  const fontWrap = { fontFamily: "'Inter', system-ui, sans-serif" };
  const displayFont = { fontFamily: "'Archivo Black', sans-serif" };

  if (stage === 'loading' || stage === 'checked') {
    return (
      <div style={fontWrap} className="min-h-screen flex items-center justify-center bg-slate-900 text-stone-100">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
        A carregar...
      </div>
    );
  }

  if (stage === 'name-entry') {
    return (
      <div style={fontWrap} className="min-h-screen bg-slate-900 text-stone-100 flex items-center justify-center px-6">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
        <form onSubmit={handleNameSubmit} className="w-full max-w-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 justify-center mb-2">
            <Trophy className="text-amber-400" size={28} />
            <h1 style={displayFont} className="text-2xl text-stone-100">
              PTZ Bet
            </h1>
          </div>
          <p className="text-center text-slate-400 text-sm">Como te chamas? É só para sabermos de quem são os palpites.</p>
          <input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="O teu nome"
            className="rounded-xl bg-slate-800 border border-slate-700 text-stone-100 py-3 px-4 text-center text-lg"
          />
          <button type="submit" className="rounded-xl bg-amber-500 text-slate-900 font-bold py-3">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={fontWrap} className="min-h-screen bg-slate-900 text-stone-100 pb-10">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-md mx-auto px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="text-amber-400" size={22} />
              <h1 style={displayFont} className="text-lg text-stone-100">
                PTZ Bet
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => loadShared()} className="text-slate-400 hover:text-amber-300" title="Atualizar">
                <RefreshCw size={16} />
              </button>
              {isAdmin ? (
                <button onClick={lockAdmin} className="flex items-center gap-1 text-xs text-teal-300" title="Bloquear admin">
                  <Unlock size={14} /> admin
                </button>
              ) : (
                <button onClick={() => setPinOpen((v) => !v)} className="flex items-center gap-1 text-xs text-slate-400" title="Entrar como admin">
                  <Lock size={14} />
                </button>
              )}
            </div>
          </div>

          {pinOpen && !isAdmin && (
            <div className="flex items-center gap-2 mb-3">
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="código admin"
                className="flex-1 rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm"
              />
              <button onClick={handlePinSubmit} className="rounded-md bg-amber-500 text-slate-900 text-xs font-bold px-3 py-1.5">
                OK
              </button>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
            <span>
              Olá, <span className="text-stone-200 font-semibold">{myName}</span>
            </span>
            <span>
              Os teus pontos:{' '}
              <span className="text-amber-300 font-bold tabular-nums">{myTotal}</span>
              {myRank > 0 ? ` · ${myRank}º lugar` : ''}
            </span>
          </div>

          <div className="flex rounded-xl bg-slate-800 p-1 overflow-x-auto">
            {[
              ['terminados', 'Terminados'],
              ['proximos', 'Próximos'],
              ['classificacao', 'Classificação'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTab(val)}
                className={`flex-1 rounded-lg py-2 text-xs sm:text-sm font-bold transition whitespace-nowrap px-1 ${
                  tab === val ? 'bg-amber-500 text-slate-900' : 'text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4 flex flex-col gap-3">
        {toast && (
          <div className="rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-200 text-sm px-3 py-2 text-center">
            {toast}
          </div>
        )}

        {tab === 'proximos' && (
          <>
            {liveMatches.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> A decorrer agora
                </p>
                {liveMatches.map((m) => (
                  <MatchCard
                    key={`live-${m.id}`}
                    match={m}
                    pick={myPicks[m.id]}
                    result={results[m.id]}
                    isAdmin={isAdmin}
                    myName={myName}
                    onSavePick={savePick}
                    onSaveResult={saveResult}
                    otherPicks={picksByMatch[m.id] || []}
                    knownPlayers={knownPlayers}
                    onAdminSavePick={adminSavePick}
                  />
                ))}
              </div>
            )}

            <div className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400">Mostrar próximos</span>
                <span className="text-sm font-bold text-amber-300">
                  {proximosDays} {proximosDays === 1 ? 'dia' : 'dias'}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="14"
                value={proximosDays}
                onChange={(e) => setProximosDays(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="rounded-md bg-slate-800 border border-slate-700 text-stone-100 py-1.5 px-2 text-sm self-start"
            >
              <option value="Todos">Todos os grupos</option>
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  Grupo {g}
                </option>
              ))}
            </select>

            {proximosGroupedByDate.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">Sem jogos por decidir nesta janela de dias.</p>
            )}

            {proximosGroupedByDate.map(([date, matches]) => (
              <div key={date} className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-wide text-slate-500 mt-2">{formatDate(date)}</p>
                {matches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    pick={myPicks[m.id]}
                    result={results[m.id]}
                    isAdmin={isAdmin}
                    myName={myName}
                    onSavePick={savePick}
                    onSaveResult={saveResult}
                    otherPicks={picksByMatch[m.id] || []}
                    knownPlayers={knownPlayers}
                    onAdminSavePick={adminSavePick}
                  />
                ))}
              </div>
            ))}

            {isAdmin && <AddMatchForm onAdd={addExtraMatch} />}

            <p className="text-xs text-slate-500 text-center mt-2 mb-4">
              Os jogos da fase eliminatória (oitavos em diante) ainda não têm equipas confirmadas — o admin vai adicionando à medida que os grupos terminam.
            </p>
          </>
        )}

        {tab === 'terminados' && (
          <>
            {terminadosMatches.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">Ainda não há jogos terminados.</p>
            )}
            {terminadosMatches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                pick={myPicks[m.id]}
                result={results[m.id]}
                isAdmin={isAdmin}
                myName={myName}
                onSavePick={savePick}
                onSaveResult={saveResult}
                otherPicks={picksByMatch[m.id] || []}
                knownPlayers={knownPlayers}
                onAdminSavePick={adminSavePick}
              />
            ))}
          </>
        )}

        {tab === 'classificacao' && (
          <div className="flex flex-col gap-2">
            {/* Filtros de ordenação */}
            <button
              onClick={() => setLbSort('total')}
              className={`w-full rounded-lg py-2 px-2 text-sm font-bold transition ${
                lbSort === 'total' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              🏅 Geral
            </button>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ['exact',    '🎯 Exatos'],
                ['outcome',  '✅ Vencedores'],
                ['scorer',   '⚽ Marcadores'],
                ['pleno',    '🌟 Plenos'],
                ['qualify',  '🎟️ Apuramentos'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setLbSort(key)}
                  className={`rounded-lg py-2 px-2 text-xs font-bold transition ${
                    lbSort === key ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {leaderboard.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">Ainda ninguém fez palpites.</p>
            )}

            {[...leaderboard]
              .sort((a, b) => {
                if (lbSort === 'exact')   return b.exactCount - a.exactCount   || b.total - a.total || a.name.localeCompare(b.name);
                if (lbSort === 'outcome') return b.outcomeCount - a.outcomeCount || b.total - a.total || a.name.localeCompare(b.name);
                if (lbSort === 'scorer')  return b.scorerPoints - a.scorerPoints || b.scorerCount - a.scorerCount || a.name.localeCompare(b.name);
                if (lbSort === 'pleno')   return b.plenoCount - a.plenoCount   || b.total - a.total || a.name.localeCompare(b.name);
                if (lbSort === 'qualify') return b.qualifyCount - a.qualifyCount || b.total - a.total || a.name.localeCompare(b.name);
                return b.total - a.total || a.name.localeCompare(b.name);
              })
              .map((row, i) => {
                const isFirst = i === 0;
                const isSecond = i === 1;
                const isThird = i === 2;
                const isPodium = lbSort === 'total' && (isFirst || isSecond);
                const isMe = row.name === myName;

                const cardClass = isPodium && isFirst
                  ? 'bg-amber-500/15 border-amber-400/60'
                  : isPodium && isSecond
                  ? 'bg-slate-700/60 border-slate-500/60'
                  : isMe
                  ? 'bg-sky-500/10 border-sky-500/40'
                  : 'bg-slate-800 border-slate-700';

                const rankEl = lbSort === 'total'
                  ? isFirst  ? <span className="text-xl">🏆</span>
                  : isSecond ? <span className="text-xl">🥈</span>
                  :            <span className="w-6 text-center font-black text-slate-500">{i + 1}</span>
                  : isFirst  ? <span className="text-xl">🥇</span>
                  : isSecond ? <span className="text-xl">🥈</span>
                  : isThird  ? <span className="text-xl">🥉</span>
                  :            <span className="w-6 text-center font-black text-slate-500">{i + 1}</span>;

                const scoreClass = isPodium && isFirst
                  ? 'text-amber-300 border-amber-500/50 bg-amber-500/10'
                  : isPodium && isSecond
                  ? 'text-slate-200 border-slate-500 bg-slate-800'
                  : 'text-amber-300 border-slate-700 bg-slate-900';

                const highlight =
                  lbSort === 'exact'   ? `${row.exactCount} exatos`
                  : lbSort === 'outcome' ? `${row.outcomeCount} vencedores`
                  : lbSort === 'scorer'  ? `${row.scorerPoints} pts marcador`
                  : lbSort === 'pleno'   ? `${row.plenoCount} plenos 🌟`
                  : lbSort === 'qualify' ? `${row.qualifyCount} apuramentos 🎟️`
                  : null;

                const statValue =
                  lbSort === 'exact'   ? row.exactCount
                  : lbSort === 'outcome' ? row.outcomeCount
                  : lbSort === 'scorer'  ? row.scorerPoints
                  : lbSort === 'pleno'   ? row.plenoCount
                  : lbSort === 'qualify' ? row.qualifyCount
                  : row.total;

                const isPlenoKing = lbSort === 'pleno' && isFirst && row.plenoCount > 0;

                return (
                  <div key={row.name} className={`flex items-center gap-3 rounded-xl px-3 py-3 border ${cardClass}`}>
                    <div className="w-6 flex items-center justify-center shrink-0">{rankEl}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          className="font-bold truncate text-stone-100 hover:text-amber-300 transition text-left"
                          onClick={() => { setHistoryPlayer(row.name); setComparePlayer(null); }}
                        >{row.name}</button>
                        {isPodium && <span className="text-xs text-slate-400 shrink-0">🍽️</span>}
                      </div>
                      <p className="text-xs text-slate-400">
                        {highlight
                          ? <><span className="text-amber-300 font-semibold">{highlight}</span> · {row.total} pts total</>
                          : <>{row.exactCount} exatos · {row.outcomeCount} venc. · {row.scorerCount} marc. · {row.plenoCount} plenos · {row.qualifyCount} apuram.</>
                        }
                      </p>
                      {isPlenoKing && (
                        <p className="text-xs text-amber-300 font-bold mt-0.5">🌭 Rei dos Cachorros</p>
                      )}
                    </div>
                    <button
                      className="shrink-0 text-sm text-slate-500 hover:text-sky-400 transition px-1"
                      onClick={() => { setHistoryPlayer(row.name); setComparePlayer(null); }}
                      title="Ver histórico / comparar"
                    >⇄</button>
                    <span style={displayFont} className={`px-3 py-1 rounded-lg border tabular-nums font-bold ${scoreClass}`}>
                      {statValue}
                    </span>
                  </div>
                );
              })
            }
            {lbSort !== 'pleno' && (
              <p className="text-xs text-slate-600 text-center mt-1">🍽️ Os dois primeiros lugares (por pontos) ganham jantar pago</p>
            )}
            {lbSort === 'pleno' && (
              <p className="text-xs text-slate-600 text-center mt-1">🌭 O 1º lugar em Plenos é o Rei dos Cachorros</p>
            )}
          </div>
        )}
      </div>

      {historyPlayer && (
        <PlayerHistoryModal
          playerA={historyPlayer}
          playerB={comparePlayer}
          knownPlayers={knownPlayers}
          buildHistory={buildPlayerHistory}
          onClose={() => { setHistoryPlayer(null); setComparePlayer(null); }}
          onChangeCompare={setComparePlayer}
        />
      )}
    </div>
  );
}

function PlayerHistoryModal({ playerA, playerB, knownPlayers, buildHistory, onClose, onChangeCompare }) {
  const historyA = React.useMemo(() => buildHistory(playerA), [playerA, buildHistory]);
  const historyB = React.useMemo(() => (playerB ? buildHistory(playerB) : null), [playerB, buildHistory]);

  const totalA = historyA.reduce((s, h) => s + h.pts.total, 0);
  const totalB = historyB ? historyB.reduce((s, h) => s + h.pts.total, 0) : null;

  const historyBByMatch = React.useMemo(() => {
    if (!historyB) return {};
    const map = {};
    for (const h of historyB) map[h.match.id] = h;
    return map;
  }, [historyB]);

  const otherPlayers = knownPlayers.filter((n) => n !== playerA);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <div className="min-w-0">
            <p className="font-bold text-stone-100 truncate">
              {playerB ? `${playerA} vs ${playerB}` : playerA}
            </p>
            <p className="text-xs text-slate-400">
              {playerB
                ? `${totalA} pts vs ${totalB} pts (dif. ${totalA - totalB > 0 ? '+' : ''}${totalA - totalB})`
                : `${totalA} pts no total`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 flex items-center justify-center"
          >✕</button>
        </div>

        <div className="px-4 py-2.5 border-b border-slate-700 shrink-0">
          <p className="text-xs text-slate-500 mb-1.5">Comparar com:</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onChangeCompare(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                !playerB ? 'bg-amber-500 text-slate-900 border-amber-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              }`}
            >Ninguém</button>
            {otherPlayers.map((n) => (
              <button
                key={n}
                onClick={() => onChangeCompare(n)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border truncate max-w-[120px] ${
                  playerB === n ? 'bg-sky-500 text-slate-900 border-sky-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
              >{n}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {historyA.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">Ainda não há jogos terminados.</p>
          )}
          {historyA.map(({ match, pick, result, pts }) => {
            const entryB = historyB ? historyBByMatch[match.id] : null;
            const diff = entryB ? pts.total - entryB.pts.total : 0;

            const PickLine = ({ p, pt, label }) => (
              <div className="flex-1 min-w-0">
                {label && <p className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">{label}</p>}
                {p ? (
                  <p className="text-xs text-slate-300 truncate">
                    {p.scoreA ?? '?'}-{p.scoreB ?? '?'}
                    {p.scorer ? ` · ${p.scorer}` : ''}
                  </p>
                ) : (
                  <p className="text-xs text-slate-600 italic">sem palpite</p>
                )}
                <p className={`text-xs font-bold ${pt.total > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                  +{pt.total} pts
                  {pt.total > 0 && (
                    <span className="text-slate-500 font-normal">
                      {' '}({[
                        pt.exact ? `${pt.exact} exato` : null,
                        pt.outcome ? `${pt.outcome} venc.` : null,
                        pt.scorer ? `${pt.scorer} marc.` : null,
                        pt.qualify ? `${pt.qualify} apuram.` : null,
                      ].filter(Boolean).join(', ')})
                    </span>
                  )}
                </p>
              </div>
            );

            const teamA = result.teamAName || match.teamA;
            const teamB = result.teamBName || match.teamB;

            return (
              <div
                key={match.id}
                className={`rounded-xl border px-3 py-2.5 ${
                  entryB
                    ? diff > 0 ? 'bg-emerald-500/10 border-emerald-500/30'
                    : diff < 0 ? 'bg-rose-500/10 border-rose-500/30'
                    : 'bg-slate-800 border-slate-700'
                    : 'bg-slate-800 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-slate-300 truncate">
                    {teamA} {result.scoreA}-{result.scoreB} {teamB}
                  </p>
                  <p className="text-[10px] text-slate-500 shrink-0 ml-2">{match.date}</p>
                </div>
                {result.scorers && result.scorers.length > 0 && (
                  <p className="text-[10px] text-slate-500 mb-1.5">
                    ⚽ {Object.entries(
                      result.scorers.reduce((acc, name) => { acc[name] = (acc[name] || 0) + 1; return acc; }, {})
                    ).map(([name, count]) => count > 1 ? `${name} (${count}x)` : name).join(', ')}
                  </p>
                )}
                <div className="flex gap-3">
                  <PickLine p={pick} pt={pts} label={entryB ? playerA : null} />
                  {entryB && <PickLine p={entryB.pick} pt={entryB.pts} label={playerB} />}
                </div>
                {entryB && diff !== 0 && (
                  <p className={`text-[10px] mt-1.5 font-semibold ${diff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {diff > 0 ? `${playerA} ganhou +${diff} pts aqui` : `${playerB} ganhou +${-diff} pts aqui`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
