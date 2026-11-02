/* 武将列表解析（照抄 ClubPanel / SaltPanel 内两份同源实现，合并为一份）
 * 输入 roleInfo.heroes（数组或对象），输出 { redCount, holeCount, heroList }，
 * heroList 按 battleTeamSlot 站位排序，供玩家抽屉的武将列表与英雄抽屉使用。 */
import { HERO_DICT } from "@/utils/HeroList";

const getEquipment = (equipment) => {
  let redCount = 0;
  let holeCount = 0;
  Object.values(equipment || {}).forEach((equ) => {
    Object.values(equ?.quenches || {}).forEach((item) => {
      holeCount++;
      if (item.colorId == 6) redCount++;
    });
  });
  return { redCount, holeCount };
};

export const getHeroInfo = (heroObj) => {
  let redCount = 0;
  let holeCount = 0;
  let heroList = [];

  try {
    let heroesToProcess = [];
    if (Array.isArray(heroObj)) {
      heroesToProcess = heroObj;
    } else if (typeof heroObj === "object" && heroObj !== null) {
      heroesToProcess = Object.values(heroObj);
    } else {
      return { redCount, holeCount, heroList };
    }

    heroesToProcess.forEach((hero, index) => {
      if (!hero) return;
      const id = hero.heroId || hero.id;
      const heroInfo = HERO_DICT[id] || {};
      const equipmentInfo = hero.equipment
        ? getEquipment(hero.equipment)
        : { redCount: 0, holeCount: 0 };

      const heroId = id || `unknown_${index}`;
      const tempObj = {
        heroId,
        artifactId: hero.artifactId || "",
        power: hero.power || 0,
        star: hero.star || 0,
        equipment: hero.equipment,
        heroName: hero.heroName || hero.name || heroInfo.name || `未知武将_${index}`,
        heroAvate: hero.heroAvate || hero.headImg || heroInfo.avatar || "",
        level: hero.level || 0,
        hole: equipmentInfo.holeCount,
        red: equipmentInfo.redCount,
        HolyBeast: hero.hB?.active === true || hero.fourBasest?.level > 0,
        HBlevel: hero.hB?.order || hero.fourBasest?.level || 0,
        skillList: hero.skillList || [],
        attributeList: hero.attributeList || [],
        battleTeamSlot: hero.battleTeamSlot,
      };

      if (heroId) {
        redCount += tempObj.red;
        holeCount += tempObj.hole;
        heroList.push(tempObj);
      }
    });
  } catch (error) {
    console.error("处理英雄信息时发生错误:", error);
    heroList = [];
  }

  heroList.sort((a, b) => a.battleTeamSlot - b.battleTeamSlot);
  return { redCount, holeCount, heroList };
};

export const heroEquipmentQuenches = (hero, index) => {
  const equ = hero?.equipment;
  if (!equ) return [];
  const keys = Object.keys(equ);
  const target = equ[keys[index]];
  return target ? Object.values(target.quenches || {}) : [];
};
